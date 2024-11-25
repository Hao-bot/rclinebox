
const cors = require('cors');


const express = require('express');
const app = express();

// Middleware để thêm COOP và COEP headers
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
});

// Serve static files
app.use(express.static('public'))

// Sử dụng cors với tùy chỉnh các header cho Cross-Origin Isolation
app.use(cors({
    origin: '*',  // Hoặc chỉ định các origin cụ thể
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
}));


// Cung cấp các file    tĩnh trong thư mục 'public'
app.use(express.static('public'));

// Ví dụ route khác
app.get('/', (req, res) => {
    res.send('Hello, World!');
});

// Khởi động server node server.js
app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
