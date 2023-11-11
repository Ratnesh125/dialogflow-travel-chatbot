import express from "express";
import axios from 'axios'
import fs from 'fs'
import fuzzyset from 'fuzzyset'
import dotenv from 'dotenv';
import OpenAI from 'openai';
const app = express();
dotenv.config();
app.use(express.urlencoded({
    extended: true
}));
app.use(express.json());
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY
});
let storedGptResponse;
// console.log(OPENAI_API_KEY)

app.post('/greet', async function (req, res) {
    console.log("server called")
    let action = req.body.queryResult.action;

    if (action === 'input.unknown') {
        gptResponse(req.body.queryResult, res);
    }
    else if (action === 'input.findtrains') {
        console.log("called")
        findtrains(req.body.queryResult, res);
    }
    else if (action === 'output.gpt') {
        console.log("called")
        console.log(storedGptResponse)
        res.send(
            {
                fulfillmentText: storedGptResponse
            }
        );
    }
    else {
        res.send(
            {
                fulfillmentText: `No handler for the action ${action}.`
            }
        );
    }
    async function gptResponse(data) {
        let start = performance.now();
        let result = await textGeneration(data.queryText);
        let end = performance.now();
        console.log(start + " " + end)
        try {
            if (result.length > 0) {

                storedGptResponse = result

            }
        } catch (error) {
            console.error("Error: " + error);
            storedGptResponse = "Sorry, I'm not able to help with that."
        }
    }
});
async function findtrains(data, res) {
    let parameters = await data.parameters;
    let source = await parameters["geo-city-1"].toLowerCase().trim();
    let destination = await parameters["geo-city-2"].toLowerCase().trim();
    let datestr = await parameters["date"].slice(0, 10);
    if (source && destination && datestr) {
        const date = new Date(datestr);
        const daysBinary = Array.from({ length: 7 }, (_, i) => (date.getDay() === i ? 1 : 0)).join('');
        const stationCode = await readData(source, destination);
        const source_code = stationCode[0];
        const destination_code = stationCode[1];
        console.log(source_code + " " + destination_code);
        const trainData = await getTrainData(source_code, destination_code, daysBinary);
        console.log(trainData.join('\n'))
        res.send(
            {
                fulfillmentText: trainData.join('\n')
            }
        );
    }
}
async function readData(source, destination) {
    return new Promise((resolve, reject) => {
        fs.readFile("stationdata.json", "utf-8", async (err, data) => {
            let data1 = await JSON.parse(data);
            const source_actual_name = await fuzzyMatch(data1, source)
            const destination_actual_name = await fuzzyMatch(data1, destination)
            const source_code = await data1[source_actual_name];
            const destination_code = await data1[destination_actual_name];
            if (source_code && destination_code) {
                const data = [source_code, destination_code]
                resolve(data);
            }
            else {
                console.log("something went wrong,give valid input");
                reject("Invalid input");
            }
        })
    })
}

async function getTrainData(source, destination, daysBinary) {
    const trainData = await axios.get(`https://indian-railway-api.cyclic.app/trains/betweenStations/?from=${source}&to=${destination}&date=2-11-23`)
        .then(async (response) => {
            const trainData = await response.data.data;
            console.log(trainData);
            return trainData;
        })
        .catch((error) => {
            console.error('Error fetching the page:', error);
        });
    const list = []
    for (var i in trainData) {
        const binaryString1 = trainData[i].train_base.running_days;
        const binaryString2 = daysBinary || "1111111";

        // Convert binary strings to decimal numbers
        const decimalValue1 = parseInt(binaryString1, 2);
        const decimalValue2 = parseInt(binaryString2, 2);

        // Perform bitwise AND operation
        const resultDecimal = decimalValue1 & decimalValue2;

        // Convert the decimal result back to a binary string
        const binaryResult = resultDecimal.toString(2).padStart(binaryString1.length, "0");
        // console.log(binaryResult);
        if (binaryResult == binaryString2) {
            // console.log(trainData[i].train_base.train_name)
            const trainName = trainData[i].train_base.train_name
            const fromTime = trainData[i].train_base.from_time
            const toTime = trainData[i].train_base.to_time

            list.push(`${trainName} (${fromTime}:${toTime})`);
        }
    }
    // console.log(list);
    if (list.length > 0) {
        return list;
    }
    return "no direct train";
}

function fuzzyMatch(dataset, searchKey) {
    const fuzzy = fuzzyset(Object.keys(dataset));
    const matches = fuzzy.get(searchKey);
    if (matches && matches[0] && matches[0][0] > 0.7) {
        const filteredData = matches.filter(item => (item[1].endsWith("jn") && item[1].startsWith(searchKey)));
        const filteredData1 = matches.filter(item => ((item[1].includes(searchKey))));

        if (filteredData.length > 0) {
            return filteredData[0][1];
        }
        else {
            if (filteredData1.length > 0) {
                return filteredData1[0][1];//actual match
            }
            else {
                return matches[0][1]; //fuzzy match
            }
        }
    } else {
        return -1;
    }
}
async function textGeneration(userprompt) {
    try {
        const prompt = `maxTokens=100, response for chatbot in very short=> ${userprompt}`;
        // const prompt = `${userprompt}`;
        const promptWords = prompt.split(' ');
        if (promptWords.length > 30) {
            console.error('Prompt should not exceed 30 words.');
            return;
        }
        const maxTokens = 100;
        const chatCompletion = await openai.chat.completions.create({
            messages: [
                { role: 'user', content: prompt },
            ],
            model: 'gpt-3.5-turbo',
            max_tokens: maxTokens,
        });
        console.log(chatCompletion)
        const jsonString = JSON.stringify(chatCompletion);
        fs.writeFile('data.json', jsonString, 'utf8', (writeErr) => {
            if (writeErr) {
                console.error('Error writing JSON file:', writeErr);
            } else {
                console.log('Data has been stored as JSON in data.json');
            }
        });
        const gptResponse = await chatCompletion.choices[0].message.content
        console.log(gptResponse)
        return gptResponse;
    }
    catch (error) {
        console.error("Error: " + error);
        return "Sorry, I'm not able to help with that."
    }
}
app.listen(3000, () => console.log("Server started on port 3000"));