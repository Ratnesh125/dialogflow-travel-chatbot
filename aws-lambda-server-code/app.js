import express from "express";
import axios from 'axios';
import fs from 'fs';
import fuzzyset from 'fuzzyset';
import OpenAI from 'openai';
const app = express();
app.use(express.urlencoded({
    extended: true
}));
app.use(express.json());
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY
});
export const handler = async (event) => {
    let action = event.queryResult.action;
    if (action === 'input.unknown') {
        const openairesponse = await gptResponse(event.queryResult);
        return {
            fulfillmentText: openairesponse
        };
    }
    else if (action === 'input.findtrains') {
        const trainData = await findtrains(event.queryResult);
        return {
            fulfillmentText: trainData.join('\n')
        };
    }
    else {
        return {
            fulfillmentText: `No handler for the action.`
        };
    }
};
async function gptResponse(data) {
    const prompt = `maxTokens=100, response for chatbot in very short=> ${data.queryText}`;
    const promptWords = prompt.split(' ');
        if (promptWords.length > 30) {
            console.error('Prompt should not exceed 30 words.');
            return 'Prompt should not exceed 30 words.';
        }
    try{    
    const chatCompletion = await openai.chat.completions.create({
        messages: [
            { role: 'user', content: data.queryText },
        ],
        model: 'gpt-3.5-turbo-1106',
        max_tokens: 100,
    });
    return chatCompletion.choices[0].message.content;
    }
    catch (error) {
        console.error("Error: " + error);
        return "Sorry, I'm not able to help with that.";
    }
}
async function getTrainData(source, destination, date) {
    const response = await axios(`https://indian-railway-api.cyclic.app/trains/betweenStations/?from=${source}&to=${destination}&date=2-12-23`);
    return response.data.data;
}
async function findtrains(data) {
    let parameters = await data.parameters;
    let source = await parameters["geo-city-1"].toLowerCase().trim();
    let destination = await parameters["geo-city-2"].toLowerCase().trim();
    let datestr = await parameters["date"].slice(0, 10);
    const date = new Date(datestr);
    const daysBinary = Array.from({ length: 7 }, (_, i) => (date.getDay() === i ? 1 : 0)).join('');
    const stationCode = await readData(source, destination);
    const source_code = stationCode[0];
    const destination_code = stationCode[1];
    const trainData = await getTrainData(source_code, destination_code, date);
    const list = [];
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
        if (binaryResult == binaryString2) {
            const trainName = trainData[i].train_base.train_name;
            const fromTime = trainData[i].train_base.from_time;
            const toTime = trainData[i].train_base.to_time;
            list.push(`${trainName} (${fromTime}:${toTime})`);
        }
    }
    if (list.length > 0) {
        return list;
    }
    return "no direct train";
}
async function readData(source, destination) {
    const rawdata = fs.readFileSync("stationdata.json");
    const data = JSON.parse(rawdata);
    const rawdataArr = await fs.readFileSync('data.json');
    const dataset = JSON.parse(rawdataArr);
    const source_actual_name = await fuzzyMatch(source, dataset);
    const destination_actual_name = await fuzzyMatch(destination, dataset);
    const source_code = await data[source_actual_name];
    const destination_code = await data[destination_actual_name];
    if (source_code && destination_code) {
        const data = [source_code, destination_code];
        return data;
    }
    else {
        console.log("something went wrong,give valid input");
        return "Invalid input";
    }
}
async function fuzzyMatch(searchKey, dataset) {
    const fuzzy = await fuzzyset(dataset);
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
