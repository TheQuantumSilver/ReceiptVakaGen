// api/search.js
const { createClient } = require('@supabase/supabase-js');
const express = require('express');
const verifyToken = require('./verify');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('FATAL ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY is not defined.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const app = express();
app.use(express.json());

app.get('/', verifyToken, async (req, res) => {
    const searchQuery = req.query.q;

    if (!searchQuery) {
        return res.status(400).json({ message: 'Search query (q) is required.' });
    }

    try {
        let queryBuilder = supabase
            .from('petitioners')
            .select('*');

        // --- THE CORRECTED LINE ---
        // Build the OR conditions separately for clarity and correctness
        const orConditions = [];

        // Condition for name search (case-insensitive LIKE)
        orConditions.push(`name.ilike.%${searchQuery}%`);

        // Condition for exact petitioner_number match (if searchQuery is a valid number)
        // Ensure it's a number before adding to the conditions for smallint type
        if (!isNaN(searchQuery) && searchQuery.trim() !== '') {
            orConditions.push(`petitioner_number.eq.${searchQuery}`);
        }

        // Apply the OR filter
        queryBuilder = queryBuilder.or(orConditions.join(',')); // Join conditions with a comma for .or()

        // You might want to add ordering for consistency
        queryBuilder = queryBuilder.order('name', { ascending: true });

        const { data, error } = await queryBuilder; // Use queryBuilder here

        if (error) {
            console.error('Supabase search error:', error);
            return res.status(500).json({ message: 'Error performing search.' });
        }

        if (!data || data.length === 0) {
            return res.status(200).json([]);
        }

        res.status(200).json(data);

    } catch (error) {
        console.error('An unexpected error occurred during search:', error);
        res.status(500).json({ message: 'An unexpected server error occurred.' });
    }
});

module.exports = app;