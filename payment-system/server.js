// server.js
const express = require('express');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '.env.local') });

const app = express();
const port = process.env.PORT || 3000; // Use port from environment variable or default to 3000

// Middleware to parse JSON bodies for API requests
app.use(express.json());

// --- Serve Static Frontend Files ---
// This tells Express to serve files from the 'public' directory
// When someone requests '/', it will automatically serve public/index.html
app.use(express.static(path.join(__dirname, 'public')));

// --- Backend API Routes ---
// Here we dynamically import our serverless function files
// Each file in 'api/' will be treated as an API endpoint
app.use('/api/login', require('./api/login'));
app.use('/api/verify', require('./api/verify')); // Note: verify is a middleware, not a direct route here, but useful for testing its structure
app.use('/api/search', require('./api/search'));
app.use('/api/confirm', require('./api/confirm'));

// Catch-all for non-existent API routes or other requests not handled
app.use((req, res) => {
    // For API routes not found
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ message: 'API endpoint not found.' });
    }
    // For other requests, you might want to send a 404 page or redirect
    res.status(404).send('Page not found.');
});

// Start the server
app.listen(port, () => {
    console.log(`Server running locally at http://localhost:${port}`);
    console.log('Access the login page at http://localhost:3000');
    console.log('Remember to fill your .env.local file with SUPABASE_URL, SUPABASE_SERVICE_KEY, GMAIL_USER, GMAIL_APP_PASSWORD, JWT_SECRET.');
});