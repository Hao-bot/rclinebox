const express = require('express');
const app = express();

// Add headers to support SharedArrayBuffer
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    next();
});

// Serve your static files and other routes
app.use(express.static('public'));

// Start the server
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
