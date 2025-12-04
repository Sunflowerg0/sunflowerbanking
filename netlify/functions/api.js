// Netlify function handler: netlify/functions/api.js

const serverless = require('serverless-http');

// CHANGE 1: Import populateInitialData, mongoose, and the Express app instance.
// NOTE: I am using '../server' which assumes server.js is one directory up (in the project root).
// If your server.js is two directories up, change this to '../../server'.
const { app, populateInitialData, mongoose } = require('../server'); 

// Cache the database connection across warm invocations
let cachedDb = null;

async function connectToDatabase() {
    // Check if MongoDB is already connected (readyState 1)
    // We use mongoose.connection.readyState check instead of cachedDb for reliability.
    if (mongoose.connection.readyState === 1) {
        console.log('MongoDB already connected. Reusing connection.');
        return mongoose.connection;
    }

    console.log('Connecting to MongoDB...');
    try {
        // Corrected syntax: all options are correctly inside the options object {}
        // The result of connect is the Mongoose instance itself, not the connection object.
        await mongoose.connect(process.env.MONGODB_URI, {
            bufferCommands: false,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        
        console.log('MongoDB connected successfully!');

        // CHANGE 2: Call populateInitialData after successful connection
        console.log('Attempting to populate initial data...');
        await populateInitialData(); // This will create the admin user if not present
        console.log('Initial data population attempt complete.');

        cachedDb = mongoose.connection;
        return cachedDb;
    } catch (error) {
        console.error('MongoDB connection error:', error);
        cachedDb = null; // Clear cache on failure to force re-connection next time
        throw error; // Re-throw to propagate the error up
    }
}

// Wrap your Express app with serverless-http
const handler = serverless(app);

// Netlify Function handler
exports.handler = async (event, context) => {
    // IMPORTANT: Set context.callbackWaitsForEmptyEventLoop = false 
    // to allow Lambda to return the response immediately without waiting for 
    // the MongoDB connection (or other background tasks) to fully close.
    // This is crucial for performance and connection pooling.
    context.callbackWaitsForEmptyEventLoop = false;

    // Ensure the database connection is established BEFORE processing the request
    try {
        await connectToDatabase();
    } catch (dbError) {
        console.error('Handler caught DB connection error:', dbError);
        // Log the error detail without exposing sensitive info if possible
        const errorMessage = (dbError && dbError.message) || 'Unknown database error.';
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Database connection failed.', error: errorMessage }),
        };
    }

    // Now, let serverless-http handle the request and pass it to Express.
    console.log('[Netlify Function] Passing raw event to serverless-http for Express processing...');
    return handler(event, context);
};