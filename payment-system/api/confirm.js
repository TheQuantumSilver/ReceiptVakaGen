// api/confirm.js
const { createClient } = require('@supabase/supabase-js');
const nodemailer = require('nodemailer');
const express = require('express');
const verifyToken = require('./verify'); // Our JWT verification middleware
const crypto = require('crypto'); // Node.js built-in for generating random strings

// Load environment variables
// For local testing outside a Vercel dev server, you might need:
// require('dotenv').config({ path: '../.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

// --- Safety Checks for Environment Variables ---
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error('FATAL ERROR: One or more email/Supabase environment variables are not defined.');
    process.exit(1);
}

// Initialize Supabase client with the service_role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Setup Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail', // Use Gmail for sending emails
    auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
    },
});

const app = express();
app.use(express.json());

// Utility function to generate a unique payment ID
function generatePaymentId() {
    // Generates a random 10-character alphanumeric string
    return crypto.randomBytes(5).toString('hex').toUpperCase(); // 5 bytes = 10 hex characters
}

// Define the POST /api/confirm endpoint
// This endpoint is protected by our verifyToken middleware
app.post('/', verifyToken, async (req, res) => {
    const { petitionerId } = req.body; // Get the petitioner ID from the request
    const confirmedByAdminName = req.user.adminName; // Get the admin's name from the verified JWT token

    // Basic validation
    if (!petitionerId) {
        return res.status(400).json({ message: 'Petitioner ID is required.' });
    }

    let petitionerData; // To store petitioner data for email

    try {
        // Step 1: Atomic Update to Confirm Payment and Generate Payment ID
        // This is crucial for double-confirmation prevention.
        // We only update if 'payment_confirmed' is currently FALSE.
        const newPaymentId = generatePaymentId();
        const confirmedAt = new Date().toISOString(); // Get current timestamp in ISO format

        const { data, error } = await supabase
            .from('petitioners')
            .update({
                payment_confirmed: true,
                payment_id: newPaymentId,
                confirmed_by: confirmedByAdminName,
                confirmed_at: confirmedAt
            })
            .eq('id', petitionerId)
            .eq('payment_confirmed', false) // THIS IS THE ATOMIC CHECK
            .select('*') // Select the updated row to get all details for the email
            .single(); // Expecting one row to be updated

        if (error) {
            console.error('Supabase update error:', error);
            // Check for specific error if no rows were updated (meaning it was already confirmed)
            if (error.code === 'PGRST116') { // No row found or updated by .single()
                return res.status(409).json({ message: 'Payment already confirmed or petitioner not found.' });
            }
            return res.status(500).json({ message: 'Error confirming payment.' });
        }

        if (!data) {
            // This case should be handled by PGRST116, but good for explicit check
            return res.status(409).json({ message: 'Payment already confirmed or petitioner not found.' });
        }

        // If the update was successful, 'data' will contain the updated petitioner record
        petitionerData = data;
        console.log(`Payment confirmed for ${petitionerData.name}. Payment ID: ${petitionerData.payment_id}`);

        // Step 2: Send Email Receipt
        const mailOptions = {
            from: GMAIL_USER, // Your Gmail user
            to: petitionerData.email, // Petitioner's email address
            subject: `Payment Confirmed - ${petitionerData.name}`,
            html: `
                <p>Dear ${petitionerData.name},</p>
                <p>Your payment has been successfully confirmed for the event/service.</p>
                <p><strong>Payment Details:</strong></p>
                <ul>
                    <li><strong>Name:</strong> ${petitionerData.name}</li>
                    <li><strong>Petitioner #:</strong> ${petitionerData.petitioner_number}</li>
                    <li><strong>Group:</strong> ${petitionerData.petitioner_group}</li>
                    <li><strong>Department:</strong> ${petitionerData.department}</li>
                    <li><strong>Payment ID:</strong> ${petitionerData.payment_id}</li>
                    <li><strong>Amount:</strong> Rs. 1950</li>
                </ul>
                <p>Confirmed by: ${confirmedByAdminName}</p>
                <p>Date: ${new Date(petitionerData.confirmed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
                <p>Thank you!</p>
                <p>Core 0 Legal Team</p>
            `,
        };

        await transporter.sendMail(mailOptions);
        console.log(`Confirmation email sent to ${petitionerData.email}`);

        // Step 3: Respond to Frontend
        res.status(200).json({
            message: 'Payment confirmed and email sent successfully.',
            petitioner: {
                id: petitionerData.id,
                name: petitionerData.name,
                petitioner_number: petitionerData.petitioner_number,
                petitioner_group: petitionerData.petitioner_group,
                department: petitionerData.department,
                email: petitionerData.email,
                payment_confirmed: petitionerData.payment_confirmed,
                payment_id: petitionerData.payment_id,
                confirmed_by: petitionerData.confirmed_by,
                confirmed_at: petitionerData.confirmed_at
            }
        });

    } catch (error) {
        console.error('Confirmation process error:', error);
        // If email sending fails AFTER database update, we should still return success for DB.
        // But if the entire process failed before DB update, return 500.
        // For simplicity here, we catch general errors. In production, you might distinguish.
        res.status(500).json({ message: 'An unexpected error occurred during confirmation.' });
    }
});

// Vercel serverless functions export the app instance
module.exports = app;