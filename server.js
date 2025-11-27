const express = require('express');
const multer = require('multer');
const { MongoClient, ObjectId, GridFSBucket } = require('mongodb');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// MongoDB Connection
const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const dbName = process.env.DB_NAME || 'filemanager';

let db;
let bucket;

// Connect to MongoDB
async function connectDB() {
    try {
        const client = new MongoClient(mongoUri);
        await client.connect();
        db = client.db(dbName);
        bucket = new GridFSBucket(db, { bucketName: 'files' });
        console.log("MongoDB Connected!");
        
        // Create index for faster queries
        await db.collection('files').createIndex({ uploadedAt: -1 });
    } catch (err) {
        console.error("MongoDB Connection Error:", err);
        process.exit(1);
    }
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Storage: Memory (Buffer)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB Limit
});

// --- API ROUTES ---

// 1. LIST FILES
app.get('/api/files', async (req, res) => {
    try {
        const files = await db.collection('files')
            .find({}, { projection: { data: 0 } }) // Exclude data field for speed
            .sort({ uploadedAt: -1 })
            .toArray();
        
        // Transform _id to id for frontend compatibility
        const result = files.map(f => ({
            id: f._id.toString(),
            filename: f.filename,
            mimetype: f.mimetype,
            size: f.size,
            uploaded_at: f.uploadedAt
        }));
        
        res.json(result);
    } catch (err) { 
        res.status(500).json({ error: err.message }); 
    }
});

// 2. UPLOAD FILE
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send("No file");
    try {
        await db.collection('files').insertOne({
            filename: req.file.originalname,
            mimetype: req.file.mimetype,
            data: req.file.buffer, // Stores as Binary in MongoDB
            size: req.file.size,
            uploadedAt: new Date()
        });
        res.redirect('/');
    } catch (err) { 
        console.error(err);
        res.status(500).send("Upload failed"); 
    }
});

// 3. DOWNLOAD / VIEW RAW
app.get('/api/file/:id', async (req, res) => {
    try {
        // Validate ObjectId
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).send("Invalid ID");
        }
        
        const file = await db.collection('files').findOne({ 
            _id: new ObjectId(req.params.id) 
        });
        
        if (!file) return res.status(404).send("Not found");
        
        res.setHeader('Content-Type', file.mimetype);
        
        // If it's an image or text, display inline. If zip/exe, download it.
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('text/')) {
            res.setHeader('Content-Disposition', `inline; filename="${file.filename}"`);
        } else {
            res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
        }
        
        // MongoDB stores Buffer as Binary, convert back
        res.send(file.data.buffer);
    } catch (err) { 
        console.error(err);
        res.status(500).send("Error"); 
    }
});

// 4. DELETE
app.delete('/api/file/:id', async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: "Invalid ID" });
        }
        
        await db.collection('files').deleteOne({ 
            _id: new ObjectId(req.params.id) 
        });
        res.json({ success: true });
    } catch (err) { 
        res.status(500).json({ error: "Delete failed" }); 
    }
});

// 5. GET CONTENT FOR EDITING (Text only)
app.get('/api/edit/:id', async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: "Invalid ID" });
        }
        
        const file = await db.collection('files').findOne(
            { _id: new ObjectId(req.params.id) },
            { projection: { filename: 1, mimetype: 1, data: 1 } }
        );
        
        if (!file) return res.status(404).json({ error: "Not found" });
        
        // Convert Binary/Buffer to String
        const content = file.data.buffer.toString('utf-8');
        res.json({ 
            filename: file.filename, 
            mimetype: file.mimetype, 
            content: content 
        });
    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: "Error" }); 
    }
});

// 6. SAVE EDITED CONTENT
app.put('/api/edit/:id', async (req, res) => {
    try {
        if (!ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: "Invalid ID" });
        }
        
        const { content } = req.body;
        // Convert String to Buffer
        const buffer = Buffer.from(content, 'utf-8');
        const size = buffer.length;
        
        await db.collection('files').updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { data: buffer, size: size } }
        );
        res.json({ success: true });
    } catch (err) { 
        res.status(500).json({ error: "Update failed" }); 
    }
});

// Start server after DB connection
connectDB().then(() => {
    app.listen(port, () => {
        console.log(`Manager running on port ${port}`);
    });
});
