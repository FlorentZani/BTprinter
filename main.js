// main.js
const express = require('express');
const bodyParser = require('body-parser');
// Import the channel from nodejs-mobile-react-native to communicate with the React Native layer
const channel = require('nodejs-mobile-react-native').channel;
const app = express();

app.use(bodyParser.json());

app.post('/printEndpoint', (req, res) => {
  const invoice = req.body.invoice;
  if (invoice) {
    // Send the invoice data to the React Native app using the channel
    const message = JSON.stringify({
      action: 'print_invoice',
      invoice: invoice
    });
    channel.post(message);
    res.status(200).send('Invoice sent to printer');
  } else {
    res.status(400).send('Missing invoice data');
  }
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});

