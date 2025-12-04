const serverless = require('serverless-http');

// This path MUST now resolve to the new server.js file created in the project root.
const { app, populateInitialData, mongoose } = require('../../server'); // Path to your Express app (server.js)
// Cache the database connection across warm invocations
let cachedDb = null;

async function connectToDatabase() {
    // Check if MongoDB is already connected (readyState 1)
    if (mongoose.connection.readyState === 1) {
        console.log('MongoDB already connected. Reusing connection.');
        return mongoose.connection;
    }

    console.log('Connecting to MongoDB...');
    try {
        // Note: process.env.MONGODB_URI must be set in Netlify environment variables
        await mongoose.connect(process.env.MONGODB_URI, {
            bufferCommands: false,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            // 💡 OPTIMIZATION: Limit the pool size for serverless environments
            maxPoolSize: 1, 
            minPoolSize: 1, 
        });
        
        console.log('MongoDB connected successfully!');

        // Call populateInitialData after successful connection
        console.log('Attempting to populate initial data...');
        // The implementation for this function is now available in './server' (copied from root)
        await populateInitialData(); 
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
    context.callbackWaitsForEmptyEventLoop = false;

    // Ensure the database connection is established BEFORE processing the request
    try {
        await connectToDatabase();
    } catch (dbError) {
        console.error('Handler caught DB connection error:', dbError);
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