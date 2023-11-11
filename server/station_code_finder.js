import express from "express";
import axios from 'axios'
import { load } from 'cheerio';
import fs from 'fs';
const app = express();
app.use(express.urlencoded({
    extended: true
}));
app.use(express.json());

const url = 'https://icf.indianrailways.gov.in/PB/pass/stations.html';
axios.get(url)
    .then((response) => {
        const html = response.data;
        const $ = load(html);
        const array = [];
        $('#a1 , #a2').each((index, element) => {
            const value = $(element).text().trim().toLowerCase();
            array.push(value);
        });
        const pairs = {};

        for (let i = 0; i < array.length; i += 2) {
            const key = array[i + 1];
            const value = array[i];
            pairs[key] = value;
        }
        const jsonString = JSON.stringify(pairs);
        fs.writeFile('station_code_finder.js', jsonString, 'utf8', (writeErr) => {
            if (writeErr) {
                console.error('Error writing JSON file:', writeErr);
            } else {
                console.log('Data has been stored as JSON in station_code_finder.js');
            }
        });
    
        const size = Object.keys(pairs).length;
        const city = "dewas".toLowerCase().trim();
        console.log(size);
        // console.log(pairs[city]);
    })
    .catch((error) => {
        console.error('Error fetching the page:', error);
    });

app.listen(3001, () => console.log("Server started on port 3000"));
