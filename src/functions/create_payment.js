const axios = require('axios');
require('dotenv').config();

async function createPayment(id_token, paymentBody) {
    const url = 'https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized/checkout/create';
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'authorization': id_token,
        'x-app-key': process.env.APP_KEY
    };
    console.log(paymentBody, "paymentBody" , headers);
    try {
        const response = await axios.post(url, paymentBody, { headers });
        console.log("main usman",response.data);
        return response.data;
    } catch (error) {
        console.error('Error creating payment:', error);
        throw error;
    }
}

module.exports = createPayment;