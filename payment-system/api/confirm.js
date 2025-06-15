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

        // --- Determine Payment Amount based on Petitioner Group ---
        let petitionerCaseNumber; // String for storing the case number
        let paymentAmountDisplay; // String for displaying in email (e.g., "₹2000")
        let paymentDescription;   // Contextual description for email

        if (petitionerData.petitioner_group === 3) {
            paymentAmountDisplay = '₹1050'; // Amount for Group 3
            paymentDescription = 'for third phase collection';
            petitionerCaseNumber = 'WPA26400/2024'
        } else if (petitionerData.petitioner_group === 2) {
            paymentAmountDisplay = '₹1950'; // Amount for Group 1 and 2
            paymentDescription = 'for fourth phase collection';
            petitionerCaseNumber = 'WPA13054/2024'
        } else if (petitionerData.petitioner_group === 1) {
            paymentAmountDisplay = '₹1950'; // Amount for Group 1 and 2
            paymentDescription = 'for fourth phase collection';
            petitionerCaseNumber = 'WPA3028/2024'
        } else {
            // Default case for any other group, or if group is not set/invalid
            paymentAmountDisplay = 'Amount not specified';
            paymentDescription = 'for registration';
            console.warn(`Petitioner ${petitionerData.id} has unhandled group: ${petitionerData.petitioner_group}.`);
        }

        // Step 2: Send Email Receipt
        const mailOptions = {
            from: GMAIL_USER, // Your Gmail user
            to: petitionerData.email, // Petitioner's email address
            subject: `Payment Confirmed - ${petitionerData.name}`,
            html: `
                <div style="font-family: Helvetica, sans-serif;">
                    <p>Dear ${petitionerData.name},</p>
                    <p>Your payment ${paymentDescription} has been successfully confirmed.</p>
                    <p><strong>Registration Details:</strong></p>
                    <ul>
                        <li><strong>Name:</strong> ${petitionerData.name}</li>
                        <li><strong>Petitioner Serial No.:</strong> ${petitionerData.petitioner_number}</li>
                        <li><strong>Phase:</strong> ${petitionerData.petitioner_group}</li>
                        <li><strong>Case:</strong> ${petitionerCaseNumber}</li>
                        <li><strong>Department:</strong> ${petitionerData.department}</li>
                        <li><strong>Amount:</strong> ${paymentAmountDisplay}</li><br>
                        <li><strong>Payment ID:</strong> ${petitionerData.payment_id}</li>
                    </ul>
                    <p><strong>NOTE:</strong> <em>You must take a screenshot of this email receipt and upload it to the google form. Failure
                        to do so will result in your payment not being processed.</em></p>
                    <p><strong>Google Form: </strong>https://forms.gle/yTp9UqVxYB6ERA4d8</p>
                    <p><strong>Confirmed by:</strong> ${confirmedByAdminName}
                        <br><strong>Date:</strong> ${new Date(petitionerData.confirmed_at).toLocaleString('en-IN', { timeZone:
                        'Asia/Kolkata' })}
                    </p>
                    <p>Thank you!
                        <br><strong>Core 0 Legal Team</strong>
                    </p>
                    <p> --- </p>
                    <p><em>Please do not reply to this mail as this is a system generated mail.</em></p>
                </div>
            `,
        };

        await transporter.sendMail(mailOptions);
        console.log(`Confirmation email sent to ${petitionerData.email}`);

        // Step 3: Respond to Frontend
        res.status(200).json({
            message: `Payment confirmed and email sent successfully. Amount: ${paymentAmountDisplay}.`,
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
        res.status(500).json({ message: 'An unexpected error occurred during confirmation.' });
    }
});

// Vercel serverless functions export the app instance
module.exports = app;