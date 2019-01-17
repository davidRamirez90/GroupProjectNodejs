const express = require('express');
const http = require('http');
const pat = require('path');

const app = express();

const port = 4200;

app.use(express.static(__dirname + '/dist/opcuafrontend'));

app.get('/*', (req, res) => res.sendFile(path.join(__dirname)));

const server = http.createServer(app);

server.listen(port, () => console.log('Running Frontend Server'));
