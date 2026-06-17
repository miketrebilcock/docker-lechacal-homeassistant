const SerialPort = require('serialport');
const config = require('config-yml');
const mqtt = require('mqtt');

const Readline = SerialPort.parsers.Readline;
const parser = new Readline();

const port = new SerialPort(config.serialPort || '/dev/ttyAMA0', {
    baudRate: config.baudRate || 38400,
    autoOpen: false
})

var IrmsMAoffset = config.IrmsMAoffset || 0;
var receivedSerialData = false;

console.log("Establishing MQTT connection...");
var mqttClient  = mqtt.connect(`mqtt://${config.mqttServer || '0.0.0.0'}:${config.mqttPort || 1883}`, {username: config.mqttUsername, password: config.mqttPassword})
const responseJsonTemplate = require(`./config/device-mapping/${config.deviceMapping || 'RPICT7V1.json'}`);

// ------------------------------------------------------------

console.log("Connecting to serial port...");
port.open(function (err) {
    if (err) {
        return console.log('Error opening port: ', err.message);
        process.exit(key, unit_of_measurement, icon);
    }
})

mqttClient.on('connect', function () {
    console.log("Creating HA Sensors...");
    createHASensors();
})

port.pipe(parser);
parser.on('data', function (data) {

    // Example of values: http://lechacal.com/wiki/index.php?title=RPICT7V1_v2.0
    //     NodeID  RP1     RP2     RP3     RP4     RP5     RP6     RP7     Irms1   Irms2   Irms3   Irms4   Irms5   Irms6   Irms7   Vrms
    //     11      0.0     0.0     0.0     -0.0    0.0     0.0     -0.0    202.1   208.6   235.3   207.2   223.4   3296.3  2310.8  0.9

    // Values from sensor are returned with space/tab between each value.
    var values = data.split(/[ ,]+/);
    var count = 0;

    // Read sensor mapping from JSON file.
    Object.keys(responseJsonTemplate).forEach(function(key) {
        try {
    	    const value = parseDataFromTemplateParams(values[count], key);
    	    if (!isNaN(value)) {
        	pushHASensorData(key, value);
	    }
        } catch(e) {
            console.error(e);
        }
        count++;
    });

    if(!receivedSerialData) console.log("Received data from sensor, and posted to MQTT... Program is up and running!"); receivedSerialData = true;

});

function parseDataFromTemplateParams(data, configItem) {
    var returnValue;
    switch(responseJsonTemplate[configItem].type) {
      case "float":
        returnValue = parseFloat(data) + IrmsMAoffset;
        break;
      case "integer":
        returnValue = parseInt(data) + IrmsMAoffset;
        break;
      case "string":
        returnValue = data;
        break;
      default:
        returnValue = data;
    }

    // If there's options to 'transform' the value/number (ie divide, multiply etc - apply these calculations...)
    var transformMath = (responseJsonTemplate[configItem].convertMath === undefined) ? false : responseJsonTemplate[configItem].convertMath;
    if(transformMath) {
        return eval(`${returnValue} ${transformMath}`);
    } else {
        return returnValue;
    }
}

function createHASensor(name, unit_of_measurement, icon) {
    const config_payload = {
        "name": name,
        "unique_id": `${config.mqttDevicename || 'lechacal'}_${name}`,
        "unit_of_measurement": unit_of_measurement,
        "state_topic": `${config.mqttTopic || 'homeassistant'}/sensor/${config.mqttDevicename || 'lechacal'}_${name}`,
        "icon": `mdi:${icon}`,
        "device": {
            "identifiers": [config.mqttDevicename || 'lechacal'],
            "name": config.mqttDevicename || 'lechacal',
            "model": config.deviceMapping || 'RPICT3T1',
            "manufacturer": "Lechacal"
        }
    };
    if (unit_of_measurement === 'W') {
        config_payload.device_class = "power";
        config_payload.state_class = "measurement";
    }
    mqttClient.publish(
        `${config.mqttTopic || 'homeassistant'}/sensor/${config.mqttDevicename || 'lechacal'}_${name}/config`,
        JSON.stringify(config_payload),
        { retain: true }
    );
}

function pushHASensorData(name, data) {
    const importValue = data > 0 ? data : 0;
    const exportValue = data < 0 ? Math.abs(data) : 0;
    mqttClient.publish(
        `${config.mqttTopic || 'homeassistant'}/sensor/${config.mqttDevicename || 'lechacal'}_${name}`, `${importValue}`
    );
    mqttClient.publish(
        `${config.mqttTopic || 'homeassistant'}/sensor/${config.mqttDevicename || 'lechacal'}_${name}_export`, `${exportValue}`
    );
}

function createHASensors() {
    // Logic to Auto-create HA device...
    Object.keys(responseJsonTemplate).forEach(function(key) {
        createHASensor(key, responseJsonTemplate[key].unit_of_measurement, responseJsonTemplate[key].icon);
	createHASensor(key + '_export', responseJsonTemplate[key].unit_of_measurement, responseJsonTemplate[key].icon);
    });
}

setTimeout(createHASensors, 1000 * 60 * 5); // Re-create HA sensors every 5 minutes (if HA is restarted etc)...