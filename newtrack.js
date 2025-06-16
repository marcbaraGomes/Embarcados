const fs = require('fs');
const WebSocket = require('ws');
const https = require('https');
const SerialPort = require('serialport');
const express = require('express');
const path = require('path');
const app = express();
const { exec } = require('child_process');
const axios = require('axios');

const pinsToConfigure = [
    { pin: 'P9_11', mode: 'uart' },
    { pin: 'P9_13', mode: 'uart' }
];


// Configura os pinos P9_11 e P9_13 para uart
function configurePins() {
    try {
        for (const pin of pinsToConfigure) {
            const cmd = `config-pin ${pin.pin} ${pin.mode}`;
            execCommand(cmd)
                .then(() => {
                    console.log(`Pino ${pin.pin} configurado para modo ${pin.mode}.`);
                })
                .catch((error) => {
                    console.error('Erro ao configurar o pino:', error);
                });
        }
        } catch (error) {
            console.error('Erro:', error);
        }
}

async function sendToThingSpeak(latitude, longitude, altitude) {
    const apiKey = 'GAF0SJW1JCOTZXPB'; // Substitua pelo seu Write API Key do ThingSpeak
    const url = 'https://api.thingspeak.com/update';
     try {
            console.log('Enviado pelo sevidor para o ThingSpeak!');
            const response = await axios.post(url, {
                params: {
                    api_key: apiKey,
                    field1: latitude,
                    field2: longitude
                }
            })
            .then((response) => {
                console.log(response.data);
            })
            .catch((error)=>{
                console.log('ERRO ENVIO DE DADOS :',error);
            });

       // console.log(`Dados enviados ao ThingSpeak: ${latitude}, ${longitude} - Status: ${response.data}`);
    } catch (error) {
       console.error('Erro ao enviar dados ao ThingSpeak:', error.message);
    }
}

async function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

// Carregue os certificados SSL
const options = {
    key: fs.readFileSync(path.join(__dirname, 'certs', 'ca.key')),
    cert: fs.readFileSync(path.join(__dirname, 'certs', 'ca.crt'))
};

const server = https.createServer(options, app);
const wss = new WebSocket.Server({ server });

// Configuração da porta serial
const serialPort = new SerialPort('/dev/ttyO4', { baudRate: 9600 });


wss.on('connection', (socket) => {
    console.log('Conexão WebSocket estabelecida.');
    var lastSentLocation = {latitude: -3.769974, longitude:-38.479787}; // Última localização enviada para evitar repetição 
    var locationData = lastSentLocation;
    socket.send(JSON.stringify(lastSentLocation));
    
    setInterval(async () => {
        // Leitura dos dados seriais em tempo real
        serialPort.on('data', (data) => {
            var serialData = data.toString().trim();
            
            var fields = serialData.split(',');
        
           if (fields[0] === '$GNRMC' && fields.length >= 2) {
                var latitude = fields[3];
                var latitudeDirection = fields[4];
                var longitude = fields[5];
                var longitudeDirection = fields[6];
                //var altitude = fields[9];
                
                if (latitude && latitudeDirection && longitude && longitudeDirection) {
                    var latitudeDecimal = parseFloat(latitude.slice(0, 2))+parseFloat(latitude.slice(2))/60;
                    
                    var longitudeDecimal =parseFloat(longitude.slice(0, 3))+parseFloat(longitude.slice(3))/60;
                    
                    locationData = {
                            latitude: latitudeDirection == 'N' ? latitudeDecimal : -latitudeDecimal,
                            longitude: longitudeDirection == 'E' ? longitudeDecimal : -longitudeDecimal
                    };
                    
                    
                    // Verifica se a localização atual é diferente da última enviada
                    if (!lastSentLocation || locationData.latitude != lastSentLocation.latitude || locationData.longitude != lastSentLocation.longitude) {
                        lastSentLocation = locationData;    
                    }
                }
            }
        });
        if (!lastSentLocation || locationData.latitude != lastSentLocation.latitude || locationData.longitude != lastSentLocation.longitude) {
            await sendToThingSpeak(lastSentLocation.latitude, lastSentLocation.longitude);
            console.log('ENVIOU THINGSPEAK :', locationData);
        }
    }, 15000);
});


// Serve o arquivo index.html na rota raiz "/"
app.get('/', (req, res) => {
    // Use o módulo path para obter o caminho absoluto do arquivo
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(express.static('public'));

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Servidor HTTPS rodando na porta ${PORT}`);
});

function execCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
}

configurePins();