const mongoose = require('mongoose');

const taxSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
    },
    percentage: {
        type: Number,
        required: true
    },
    status:{
        type:String
    }
}, { timestamps: true });

const tax = mongoose.model('tax', taxSchema);

module.exports = tax;
