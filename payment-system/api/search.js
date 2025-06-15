// api/search.js
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const verifyToken = require('./verify'); // Our JWT verification middleware

// Load environment variables
// For local testing outside a Vercel dev server, you might need:
// require('dotenv').config({ path: '../.env.local' });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Using service key for backend operations

// --- Safety Check for Environment Variables ---
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('FATAL ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY is not defined.');
  process.exit(1);
}

// Initialize Supabase client using the service_role key
// This key bypasses RLS, which is necessary for the backend to reliably fetch any petitioner data
// even if client-side RLS rules are more restrictive.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const app = express();
app.use(express.json());

// Define the GET /api/search endpoint
// We use the verifyToken middleware HERE to protect this route.
app.get('/', verifyToken, async (req, res) => {
    // Get the search query from the URL (e.g., /api/search?q=john)
    const searchQuery = req.query.q;

    // Basic validation
    if (!searchQuery) {
        // If no search query is provided, return all petitioners
        // OR you might choose to return a 400 error. For this guide,
        // we'll return all if 'q' is empty or missing,
        // or filter if it's present.
        // Let's refine this: If no query, we return empty or an error.
        // A search without a term implies an empty result set usually.
        return res.status(400).json({ message: 'Search query (q) is required.' });
    }

    try {
        let query = supabase
            .from('petitioners')
            .select('*'); // Select ALL fields as per requirements

        // Apply search filter if a query is provided
        // We'll search by name OR petitioner_number
        // The `ilike` operator is case-insensitive
        query = query.or(`name.ilike.%<span class="math-inline">\{searchQuery\}%,petitioner\_number\.eq\.</span>{searchQuery}`);

        // You might want to add ordering for consistency
        query = query.order('name', { ascending: true }); // Order by name for consistent results

        const { data, error } = await query;

        if (error) {
            console.error('Supabase search error:', error);
            return res.status(500).json({ message: 'Error performing search.' });
        }

        // If no data is found, return an empty array (or specific message)
        if (!data || data.length === 0) {
            return res.status(200).json([]); // Return empty array if no results
        }

        // Return the found petitioners
        res.status(200).json(data);

    } catch (error) {
        console.error('An unexpected error occurred during search:', error);
        res.status(500).json({ message: 'An unexpected server error occurred.' });
    }
});

// Vercel serverless functions export the app instance
module.exports = app;