// api/verify.js
const jwt = require('jsonwebtoken');

// Make sure to load environment variables from .env.local for local development
// This line should be at the very top of your main entry point (e.g., in a development server setup)
// or implicitly handled by Vercel for serverless functions.
// For individual serverless functions, it's safer to ensure it's loaded if not managed by the runtime.
// However, Vercel automatically makes environment variables available.
// For local testing, you might need to manually load it if this file is tested standalone.
// In a Vercel serverless context, process.env will already have these.
// const dotenv = require('dotenv');
// dotenv.config({ path: '../.env.local' }); // Adjust path as needed for local testing

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  // This check is good practice for local development/testing.
  // Vercel production environment should have this set.
  console.error('FATAL ERROR: JWT_SECRET is not defined in environment variables.');
  process.exit(1); // Exit the process if a critical variable is missing
}

// This is our "bouncer" function
module.exports = function verifyToken(req, res, next) {
    // Get the token from the 'Authorization' header
    // It typically looks like: Authorization: Bearer <token>
    const authHeader = req.headers['authorization'];

    // If there's no Authorization header, or it doesn't start with "Bearer "
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Access Denied: No token provided or token format is incorrect.' });
    }

    // Extract the token part (remove "Bearer ")
    const token = authHeader.split(' ')[1]; // Splits "Bearer token" into ["Bearer", "token"] and takes the second part

    // If the token is truly missing after splitting
    if (!token) {
        return res.status(401).json({ message: 'Access Denied: Token missing after Bearer.' });
    }

    try {
        // Verify the token using our secret key
        // This will throw an error if the token is invalid or expired
        const decoded = jwt.verify(token, JWT_SECRET);

        // If the token is valid, we can attach the decoded user info to the request
        // This allows subsequent functions (like search or confirm) to know who made the request
        req.user = decoded; // 'decoded' will contain adminName and adminCode from login token
        next(); // Move on to the next function (our API logic)
    } catch (err) {
        // If verification fails (e.g., token expired, invalid signature)
        if (err.name === 'TokenExpiredError') {
            return res.status(403).json({ message: 'Access Denied: Token expired.' });
        }
        return res.status(403).json({ message: 'Access Denied: Invalid token.' });
    }
};