import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import dns from 'dns';

// Explicitly use Google DNS to bypass local Windows DNS resolution issues with SRV records
dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = async () => {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/itemhive';

    if (mongoURI.includes('<password>') || mongoURI.includes('<db_password>')) {
        throw new Error('Please configure your MONGODB_URI in the .env file with a valid password.');
    }

    // Let startup and maintenance callers stop before issuing buffered queries.
    const conn = await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 10_000 });

    console.log(`📦 MongoDB Connected: ${conn.connection.host}`);
};

export default connectDB;
