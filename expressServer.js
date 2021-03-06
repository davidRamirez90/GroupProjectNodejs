/**
 * Server code using NodeJs developed for group project WS/2018-2019 A&R
 * "Cost effective wireless automation" serves as API backend for corresponding
 * Angular WebApp and OPCUA server implemented on chemical plant
 * @param {app} express Express library used for API behaviour on server
 * @param {http} http Http server extending Express implementation
 * @param {io} socket.io Socket io library used for realtime websocket comm
 * @param {cors} cors Enabler for cross-origin domain requests ( API )
 * @param {opcua} nodeopcua Wrapper library for OPCUA client
 * @param {async} async Library for async operations / non thread blocking
 * @param {mysql} mysql Mysql Connection Library to stablish database connection
 * Credits:  Aline Fidêncio, Eslam Abdalla, Hazem Youssef, David Ramirez,
 *           Victor Rodriguez, Md Jahangir Alam
 */

/* Requires / Libraries */
const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const cors = require('cors');
const opcua = require('node-opcua');
const async = require('async');
const mysql = require('mysql');
const mqtt = require('mqtt');

/* MQTT Client initialization */
const mqttClient = mqtt.connect('mqtt://10.0.0.101:1883');

/* Necesary constants / variabales */
const port = 5000;
var t = 0;
var the_session, the_subscription;

/* Database connection initialization */
const sqlconn = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'projectgroup1'
});

/* Std variable names used for mapping */
const stdVars = [
  {
    id: 0,
    name: 'temp1'
  },
  {
    id: 1,
    name: 'temp2'
  },
  {
    id: 2,
    name: 'flow1'
  },
  {
    id: 3,
    name: 'flow2'
  }
];

/* OPCUA Client instantiation and vars */
const client = new opcua.OPCUAClient({
  endpoint_must_exist: false,
  securityMode: opcua.MessageSecurityMode.NONE,
  securityPolicy: opcua.SecurityPolicy.None,
  connectionStrategy: {
    maxRetry: 0,
    maxDelay: 100,
    maxDelay: 200
  }
});

/* Cors options to allow cross origin requests */
const corsOptions = {
  origin: 'http://localhost:4200',
  optionSuccessStatus: 200
};
app.use(cors(corsOptions));

/**
 * Main function responsible for starting the OPCUA server
 * and executing all comm related operations
 */
function startHTTPServer() {
  /* Initial DB connection */
  sqlconn.connect(err => {
    if (err) console.log(`sql error ${err}`);
  });
  console.log(sqlconn);

  /* Order Server to start listening on port 5000 */
  io.listen(app.listen(port));

  /* Connection event on socket io for a client 
  TODO */
  io.on('connection', socket => {
    console.log(socket);
    console.log('someone has connected to socket');
    socket.emit('hello', {
      greeting: 'This is my greeting'
    });
  });

  /**
   * Connection event on mqtt client listening to events
   */
  mqttClient.on('connect', () => {
    mqttClient.subscribe('/sensor_data', err => {
      console.log(err);
    });
  });

  mqttClient.on('message', (topic, msg, packet) => {
    //console.log(JSON.parse(msg.toString()));
    sqlconn.query(
      `INSERT INTO mappedsensors (variable, varvalues) VALUES ( 'temp3', ${msg.toString()})`
    );
  });

  /* index entry point for server hello message */
  app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
  });

  /**
   * Api route to publish data to mqtt
   */
  app.route('/publish').get((req, res) => {
    let msg = req.query.msg;
    console.log(msg);
    mqttClient.publish('/sensor_data', msg);
    res.status('su).send(ess', 200);
  });

  /**
   * Api route to get projects from user
   * @param {token} String token of user
   */
  app.route('/api/projects').get((req, res) => {
    let tok = req.query.token;
    console.log(tok);
    sqlconn.query(
      `SELECT projects.id, projects.name, projects.description FROM users INNER JOIN projects ON users.id = projects.user_id WHERE users.token = '${tok}' `,
      (err, success) => {
        res.status(200).send({ projects: success });
      }
    );
  });

  /**
   * Api route to login new user
   * @param {username} String username
   * @param {password} String password
   */
  app.route('/api/login').get((req, res) => {
    let username = req.query.username;
    let password = req.query.password;

    sqlconn.query(
      `SELECT token FROM users WHERE username = '${username}' AND password = '${password}'`,
      (err, success) => {
        if (success & (success[0] === undefined)) res.status(400).send('user doesnt exist');
        else res.status(200).send({ token: success[0].token });
      }
    );
  });

  /**
   * Api route to register a user
   * @param {username} String username
   * @param {password} String password
   * @param {name} String name
   */
  app.route('/api/register').get((req, res) => {
    let username = req.query.username;
    let password = req.query.password;
    let name = req.query.name;
    let token = require('crypto')
      .randomBytes(64)
      .toString('hex');

    sqlconn.query(
      `INSERT INTO users (username, password, name, token) VALUES ( '${username}', '${password}','${name}', '${token}' )`,
      (err, success) => {
        if (err) res.status(400).send(err);
        else res.status(200).send({ token: token });
      }
    );
  });

  /**
   * Api route to create connection to opcua server
   * @param {url} String opcua url
   * @param {port} String opcua port
   */
  app.route('/api/connect').get((req, res) => {
    /* SQL connection configuration */
    console.log(sqlconn);
    if (sqlconn.state === 'disconnected') {
      sqlconn.connect(err => {
        if (err) console.log(`sql error ${err}`);
      });
    }

    let url = req.query.url;
    let port = req.query.port;
    manageSeriesConnection(url, port)
      .then(success => {
        console.log(`Connection success ${success} `);
        res.status(200).send(Object.assign(success, { stdVars: stdVars }));
      })
      .catch(err => {
        console.log(err);
        res.status(400).send(err.message);
      });
  });

  /**
   * Api route to browse a specific opcua folder
   * @param {name} String opcua object name to browse
   */
  app.route('/api/browse').get((req, res) => {
    let name = req.query.name;
    browseServer(name)
      .then(success => {
        console.log(success);
        res.status(200).send(success);
      })
      .catch(err => {
        console.log(err);
        res.status(400).send(err.message);
      });
  });

  /**
   * Api route to create connection to opcua server and read a variable
   * @param {id} String opcua variable browseId to read
   */
  app.route('/api/readVariable').get((req, res) => {
    let id = req.query.id;
    readVariable(id)
      .then(success => {
        console.log(success);
        res.status(200).send(success);
      })
      .catch(err => {
        console.log(err);
        res.status(400).send(err.message);
      });
  });

  /**
   * Api route to create subscription to opcua server and monitor variable
   * @param {id} String opcua variable browseId to monitor
   */
  app.route('/api/monitorVariable').get((req, res) => {
    let id = req.query.id;
    let sVar = req.query.stdVar;
    monitorVariable(id, sVar)
      .then(success => {
        console.log(success);
        res.status(200).send(success);
      })
      .catch(err => {
        console.log(err);
        res.status(400).send(err.message);
      });
  });

  /**
   * Api route to disconnect from opcua server
   */
  app.route('/api/disconnect').get((req, res) => {
    client.disconnect(err => {
      if (err) {
        console.log(`An error ocurred while disconnecting from server, ${err}`);
        res.status(400).send({ status: err });
      } else {
        console.log(`Successfully disconnected`);
        res.status(200).send({ status: 'Disconnected from server' });
      }
    });
    // sqlconn.end();
  });
}
/**
 * Async function responsible for opcua variable monitoring
 * @param {id} String opcua variable browseId to monitor
 * @returns {Promise} reject / resolve
 */
function monitorVariable(id, stdVar) {
  console.log(id);
  return new Promise((resolve, reject) => {
    const monitoredItem = the_subscription.monitor(
      {
        nodeId: id,
        attributeId: opcua.AttributeIds.value
      },
      {
        samplingInterval: 100,
        discardOldest: true,
        queueSize: 10
      },
      opcua.read_service.TimestampsToReturn.Both,
      () => resolve({ id: id })
    );

    monitoredItem.on('changed', dataValue => {
      console.log(dataValue.value.value);
      sqlconn.query(
        `INSERT INTO mappedsensors (variable, varvalues) VALUES ( '${stdVars[stdVar].name}', ${
          dataValue.value.value
        })`
      );
      io.emit('variableValues', {
        id: id,
        data: dataValue.value
      });
    });
  });
}

/**
 * Async function responsible for opcua variable reading
 * @param {id} String opcua variable browseId to read
 * @returns {Promise} reject / resolve
 */
function readVariable(id) {
  return new Promise((resolve, reject) => {
    the_session.readVariableValue(id, (err, val) => {
      if (!err) {
        console.log(`read variable successfully: ${val}`);
        resolve(val);
      } else {
        console.log(`An error has occurred ${err}`);
        reject(err);
      }
    });
  });
}

/**
 * Api route to browse a specific opcua folder
 * @param {name} String opcua object name to browse
 * @returns {Promise} reject / resolve
 */
function browseServer(name) {
  let folders = [];
  return new Promise((resolve, reject) => {
    the_session.browse(name, (err, res) => {
      if (!err) {
        folders = res.references.map(node => {
          console.log(`> Folder: ${node.browseName}`);
          return node;
        });
        console.log(`Success, found: ${folders}`);
        resolve(folders);
      } else {
        console.log(`An error has ocurred: ${err}`);
        reject(err);
      }
    });
  });
}

/**
 * Method used to create initial connection to OPCUA Server
 * @param {url} String url of server to connect to
 * @param {port} String port of server to connect to
 * @returns {Promise} reject / resolve
 */
function manageSeriesConnection(url, port) {
  const endpointUrl = `opc.tcp://${url}:${port}`;
  return new Promise((resolve, reject) => {
    /**
     * async.series used to execute the following steps in a predictable
     * order even though all of them are asynchronous, waiting for one to
     * finish before continuing to the next one
     */
    async.series(
      {
        /**
         * 1. Create connection to OPCUA Server
         * @param {callback} callback func to execute on success/error
         * @returns {token} String containing token showing correct connection
         * @returns {error} error in case something went wrong
         */
        token: callback => {
          client.connect(
            endpointUrl,
            err => {
              if (err) {
                console.log('Error on connection');
                callback(err, null);
              } else {
                console.log('Success connecting');
                callback(null, 'automation662230');
              }
            }
          );
        },
        /**
         * 2. Create session to OPCUA Server
         * @param {callback} callback func to execute on success/error
         * @returns {sessionId} String containing id showing correct session instantiation
         * @returns {error} error in case something went wrong
         */
        sessionId: callback => {
          client.createSession((err, session) => {
            if (!err) {
              console.log('Session initialized correctly');
              the_session = session;
              callback(null, session.sessionId);
            } else {
              console.log('An error ocurred while initializing the session');
              callback(err, null);
            }
          });
        },
        /**
         * 3. Browse RootFolder level of OPCUA Server
         * @param {callback} callback func to execute on success/error
         * @returns {data[]} Array containing found folders
         * @returns {error} error in case something went wrong
         */
        data: callback => {
          let folders = [];
          the_session.browse('RootFolder', (err, res) => {
            if (!err) {
              folders = res.references.map(node => {
                console.log(`> Folder: ${node.browseName}`);
                return node;
              });
              console.log(`Success, found: ${folders}`);
              callback(null, folders);
            } else {
              console.log(`An error has ocurred: ${err}`);
              callback(err, null);
            }
          });
        },
        /**
         * 4. Create subscription object and attach used event hooks for later use
         * @param {callback} callback func to execute on success/error
         * @returns {items[]} Array containing monitored items on subscription
         * @returns {error} error in case something went wrong
         */
        subscription: callback => {
          the_subscription = new opcua.ClientSubscription(the_session, {
            requestedPublishingInterval: 1000,
            requestedLifetimeCount: 10,
            requestedMaxKeepAliveCount: 2,
            maxNotificationsPerPublish: 10,
            publishingEnabled: true,
            priority: 10
          });
          the_subscription
            .on('started', () => {
              callback(null, the_subscription.monitoredItems);
              console.log(`Subscription started for subId: ${the_subscription.subscriptionId}`);
            })
            .on('keepalive', () => {
              console.log('keeping alive');
            })
            .on('error', () => {
              console.log(`An error has ocurred`);
              callback('Error encountered while creating subscription', null);
            })
            .on('terminated', () => {
              console.log('Terminated.....');
            });
        }
      },
      /**
       * Error. error handling in case any of above function invoced callback with an error
       * @param {err} error error message, code or handler
       * @param {res} response success message, code or handler
       * @returns {resolve} resolve Promise on success
       * @returns {reject} resolve Promise on error
       */
      (err, res) => {
        if (err) {
          console.log(`An error has ocurred: ${err.toString()}`);
          reject(err);
        } else {
          console.log(`Connected successfully to ${endpointUrl} / ${res}`);
          resolve(res);
        }
      }
    );
  });
}

startHTTPServer();
