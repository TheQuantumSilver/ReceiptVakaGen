// api/login.js
const express = require('express');
const app = express();

// THIS IS THE ONLY CONSOLE.LOG THAT MATTERS NOW
console.log('--- api/login.js function started! ---');

app.post('/', (req, res) => {
  console.log('--- api/login.js POST route hit! ---');
  res.status(200).json({ message: 'Login function is responding now!' });
});

module.exports = app;