// api/login.js
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const express = require('express');

// Load environment variables (Vercel automatically handles this in production)
// For local testing outside a Vercel dev server, you might need:
// require('dotenv').config({ path: '../.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const JWT_SECRET = process.env.JWT_SECRET;

// --- Safety Checks for Environment Variables ---
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !JWT_SECRET) {
  console.error('FATAL ERROR: One or more environment variables (SUPABASE_URL, SUPABASE_SERVICE_KEY, JWT_SECRET) are not defined.');
  // In a real Vercel deployment, this might lead to a 500 error or similar
  // but locally, we can be more explicit.
  process.exit(1);
}

// Initialize Supabase client
// We use the service_role key here because this API is responsible for sensitive operations
// like reading admin codes, which should bypass Row Level Security for security of the login flow.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const app = express();
app.use(express.json()); // Middleware to parse JSON request bodies

// This is our actual API endpoint for login
app.post('/', async (req, res) => {
    const { adminCode } = req.body; // Get the adminCode from the request

    // Basic validation: Check if adminCode is provided
    if (!adminCode) {
        return res.status(400).json({ message: 'Admin code is required.' });
    }

    try {
        // Query Supabase to find an admin with the provided code
        // Using .select('*') to get all columns (name, admin_code)
        const { data, error } = await supabase
            .from('admins')
            .select('name, admin_code') // Select specific fields for security and efficiency
            .eq('admin_code', adminCode)
            .single(); // .single() expects exactly one row, or throws an error if none/many

        if (error && error.code === 'PGRST116') { // Specific error for .single() not finding a row
            // This means no admin with that code was found
            return res.status(401).json({ message: 'Invalid admin code.' });
        }

        if (error) {
            // Other database errors
            console.error('Supabase query error:', error);
            return res.status(500).json({ message: 'Internal server error during login.' });
        }

        if (!data) {
            // This case should theoretically be caught by the PGRST116 error,
            // but it's a good safeguard in case of unexpected Supabase behavior.
            return res.status(401).json({ message: 'Invalid admin code.' });
        }

        // If an admin is found (data will contain { name, admin_code })
        const adminName = data.name;

        // Create a JWT token
        // The token will contain the admin's name and code (payload)
        // It will be signed with our secret key and expire in 8 hours
        const token = jwt.sign(
            { adminName: adminName, adminCode: adminCode },
            JWT_SECRET,
            { expiresIn: '8h' } // Token expires in 8 hours
        );

        // Send the token and admin's name back to the frontend
        res.status(200).json({ token, adminName });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'An unexpected error occurred during login.' });
    }
});

// Vercel serverless functions export the app instance
module.exports = app;