const express = require('express');
const app = express();

// Set the required headers
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
});

// Serve the files
app.use(express.static('public'));

// Start the server
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
