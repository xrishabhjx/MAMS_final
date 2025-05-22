const fs = require('fs');
const path = require('path');
const tempPath = path.join(__dirname, 'temp_attendance.json');

var config = {
    apiKey: "AIzaSyAlkTeBTBPtnVAaOnNmwiwsFVDIWKhfp5M",
    authDomain: "hackathon-mozofest-2019.firebaseapp.com",
    databaseURL: "https://hackathon-mozofest-2019.firebaseio.com",
    storageBucket: 'gs://hackathon-mozofest-2019.appspot.com/'
};

// Prevent double initialization
if (!firebase.apps.length) {
    firebase.initializeApp(config);
}

firebase.auth().onAuthStateChanged(function(user) {
    if (user) {
        console.log("Logged in already : " + user.email);
        M.toast({html:'Welcome back ' + user.email + ' !'});
    }
});

function loadAttendance(day) {
    const csvPath = path.join(__dirname, 'Attendance.csv');
    const studentsPath = path.join(__dirname, 'students.csv');
    // Read students.csv first to build a RegNo->Name map
    fs.readFile(studentsPath, 'utf8', (err, studentsData) => {
        let regNoToName = {};
        if (!err) {
            const studentLines = studentsData.trim().split('\n');
            for (let i = 1; i < studentLines.length; i++) {
                const [reg, name] = studentLines[i].split(',');
                regNoToName[reg] = name;
            }
        }
        fs.readFile(csvPath, 'utf8', (err, data) => {
            if (err) {
                console.error('Error reading attendance:', err);
                document.getElementById('attendanceTable').innerHTML = '<tr><td colspan="3">Could not load attendance.</td></tr>';
                return;
            }
            const lines = data.trim().split('\n');
            const headers = lines[0].split(',');
            const dayIndex = headers.indexOf(day);
            let html = '<table class="striped centered"><thead><tr><th>Reg No</th><th>Name</th><th>Present</th></tr></thead><tbody>';
            for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',');
                let val = cols[dayIndex];
                val = (val === '1') ? '1' : '0';
                let name = regNoToName[cols[0]] || '';
                html += `<tr><td>${cols[0]}</td><td>${name}</td><td>${val}</td></tr>`;
            }
            html += '</tbody></table>';
            document.getElementById('attendanceTable').innerHTML = html;
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    const elems = document.querySelectorAll('select');
    M.FormSelect.init(elems);
    // Initial load for Day1
    loadAttendance('Day1');
    document.querySelector('select').addEventListener('change', function() {
        const day = 'Day' + this.value;
        loadAttendance(day);
    });
});

function logOut(){
    console.log("Attempting Sign Out");
    firebase.auth().signOut().then(function() {
        console.log("Sign out successful");
        document.location.href = "adminLogin.html";
    }).catch(function(error) {
        console.log("Error signing out");
    });
}

let lastRegNo = null;
let lastFaceScore = null;

function pyCam(){
    lastRegNo = null;
    lastFaceScore = null;
    const selectedDay = document.querySelector('select').value;
    const { spawn } = require('child_process');
    const python = spawn('python', ['py/camcapture.py', selectedDay]);

    let outputBuffer = '';

    python.stdout.on('data', function(data){
        const output = data.toString('utf8');
        outputBuffer += output;
        console.log("Python:", output);
    });

    python.stderr.on('data', function(data){
        console.error("Python error:", data.toString('utf8'));
    });

    python.on('close', function(code){
        console.log("outputBuffer:", outputBuffer);

        // Extract all Detected: ... lines
        const detectedMatches = outputBuffer.match(/Detected: (\w+)/g);
        if (detectedMatches && detectedMatches.length > 0) {
            // Count occurrences of each RegNo
            const regCounts = {};
            detectedMatches.forEach(match => {
                const regMatch = match.match(/Detected: (\w+)/);
                if (regMatch && regMatch[1] !== "Unknown") {
                    const reg = regMatch[1];
                    regCounts[reg] = (regCounts[reg] || 0) + 1;
                }
            });
            // Find the RegNo with the highest count
            let maxRegNo = null, maxCount = 0;
            for (const reg in regCounts) {
                if (regCounts[reg] > maxCount) {
                    maxRegNo = reg;
                    maxCount = regCounts[reg];
                }
            }
            if (maxRegNo) {
                lastRegNo = maxRegNo;
                console.log("Extracted RegNo (majority):", lastRegNo);
            }
        }

        // After process close:
        let lastFaceScore = null;
        let scoreMatch = outputBuffer.match(/Attention Score: ([0-9.]+)/i);
        if (!scoreMatch) {
            scoreMatch = outputBuffer.match(/Returned attention score: ([0-9.]+)/i);
        }
        if (scoreMatch) {
            lastFaceScore = parseFloat(scoreMatch[1]);
            console.log("Extracted Face Score:", lastFaceScore);
        }

        if (!lastRegNo) {
            M.toast({html: "No students detected. Capture with camera first."});
        }
        console.log("About to write temp file:", lastRegNo, lastFaceScore);
        console.log("Temp file path:", tempPath);
        if (lastRegNo && lastFaceScore !== null) {
            try {
                fs.writeFileSync(tempPath, JSON.stringify({
                    regNo: lastRegNo,
                    faceScore: lastFaceScore
                }));
                console.log("Temp file written:", tempPath);
            } catch (err) {
                console.error("Error writing temp file:", err);
            }
        } else {
            console.log("Temp file NOT written. lastRegNo or lastFaceScore missing.", lastRegNo, lastFaceScore);
        }
    });
}

function capture_audio_sequence() {
    const selectedDay = document.querySelector('select').value;
    const { spawn } = require('child_process');
    const python = spawn('python', ['py/voicecap.py', selectedDay]);

    python.stdout.on('data', function(data){
        const output = data.toString('utf8');
        M.toast({html: output});
        // Try to extract audio score from output
        const scoreMatch = output.match(/Final Sentiment Score: ([0-9.]+)/);
        let audioScore = null;
        if (scoreMatch) audioScore = parseFloat(scoreMatch[1]);
        // Now, if we have RegNo, faceScore, and audioScore, call mark_attendance.py
        const tempPath = path.join(__dirname, 'temp_attendance.json');
        let regNo = null, faceScore = null;
        if (fs.existsSync(tempPath)) {
            const tempData = JSON.parse(fs.readFileSync(tempPath, 'utf8'));
            regNo = tempData.regNo;
            faceScore = tempData.faceScore;
        }
        if (regNo && faceScore !== null && audioScore !== null) {
            console.log('DEBUG: lastRegNo:', regNo);
            console.log('DEBUG: lastFaceScore:', faceScore);
            console.log('DEBUG: audioScore:', audioScore);
            console.log('DEBUG: Spawning mark_attendance.py with:', [
                'py/mark_attendance.py',
                regNo,
                'Day' + selectedDay,
                faceScore,
                audioScore
            ]);
            console.log('Calling mark_attendance.py with:', regNo, 'Day' + selectedDay, faceScore, audioScore);
            const mark = spawn('python', [
                'py/mark_attendance.py',
                regNo,
                'Day' + selectedDay,
                faceScore,
                audioScore
            ]);
            mark.stdout.on('data', function(data){
                M.toast({html: data.toString('utf8')});
                loadAttendance('Day' + selectedDay);
            });
            mark.stderr.on('data', function(data){
                console.error("Attendance Python error:", data.toString('utf8'));
            });
            mark.on('close', function(code){
                console.log('Attendance Python script exited with code', code);
            });
            // Reset after marking
            lastRegNo = null;
            lastFaceScore = null;
        }
    });

    python.stderr.on('data', function(data){
        console.error("Python error:", data.toString('utf8'));
    });

    python.on('close', function(code){
        console.log('Python script exited with code', code);
    });
}

function runRealtimeFaceDetection() {
    const { spawn } = require('child_process');
    const python = spawn('python', ['py/RealTime_MultiFace_Detection.py']);

    python.stdout.on('data', function(data) {
        console.log("Python:", data.toString('utf8'));
        M.toast({ html: data.toString('utf8') });
    });

    python.stderr.on('data', function(data) {
        console.error("Python error:", data.toString('utf8'));
        M.toast({ html: "Error: " + data.toString('utf8') });
    });

    python.on('close', function(code) {
        console.log('Python script exited with code', code);
    });
}
function startAttendanceProcess() {
    const { spawn } = require('child_process');
    const python = spawn('python', ['py/mark_attendance.py']);

    python.stdout.on('data', function(data){
        console.log("Attendance Python:", data.toString('utf8'));
        M.toast({html: data.toString('utf8')});
    });

    python.stderr.on('data', function(data){
        console.error("Attendance Python error:", data.toString('utf8'));
        M.toast({html: "Attendance Error: " + data.toString('utf8')});
    });

    python.on('close', function(code){
        console.log('Attendance Python script exited with code', code);
    });
}
function captureWithCamera() {
    pyCam(); // Only call pyCam, not both!
}


console.log("adminScreen.js ready");