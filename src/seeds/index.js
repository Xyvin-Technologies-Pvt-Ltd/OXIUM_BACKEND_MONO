const { seedAdmin } = require('./adminSeed');

const runAllSeeds = async () => {
    try {
        console.log('🚀 Starting all seeds...');

        // Run admin seed
        await seedAdmin();

        console.log('✅ All seeds completed successfully!');
    } catch (error) {
        console.error('❌ Error running seeds:', error);
        throw error;
    }
};

// Run seeds if this file is executed directly
if (require.main === module) {
    // Connect to database
    const connectDB = require('../db');

    connectDB().then(() => {
        runAllSeeds()
            .then(() => {
                console.log('✅ All seeds completed');
                process.exit(0);
            })
            .catch((error) => {
                console.error('❌ Seeds failed:', error);
                process.exit(1);
            });
    });
}

module.exports = { runAllSeeds }; 