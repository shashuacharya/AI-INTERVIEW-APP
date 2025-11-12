import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.json({
    message: 'Advanced Interview Coach Server 🚀',
    features: ['live_transcription', 'eye_contact_detection', 'filler_words', 'speaking_pace'],
    version: '4.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'Server running', version: '4.0.0' });
});

// Advanced Analysis Function
function analyzeTranscript(transcript, duration, eyeContactScore, facesDetected) {
  let score = 6;
  const suggestions = [];
  const metrics = {};

  // 1. FILLER WORD DETECTION
  const fillerWords = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally'];
  let fillerCount = 0;
  
  fillerWords.forEach(word => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    const matches = transcript.match(regex) || [];
    fillerCount += matches.length;
  });
  
  metrics.fillerWords = fillerCount;
  
  if (fillerCount === 0) {
    score += 2;
    suggestions.push('✅ Excellent! No filler words detected');
  } else if (fillerCount <= 2) {
    score += 1;
    suggestions.push(`⚠️ Reduce filler words (found ${fillerCount})`);
  } else {
    suggestions.push(`❌ Too many filler words (${fillerCount} found) - Speak with confidence`);
  }

  // 2. SPEAKING PACE (Words Per Minute)
  const wordCount = transcript.split(/\s+/).length;
  const minutesDuration = duration / 60;
  const wpm = Math.round(wordCount / minutesDuration);
  
  metrics.wordsPerMinute = wpm;
  metrics.totalWords = wordCount;
  
  if (wpm >= 120 && wpm <= 150) {
    score += 1;
    suggestions.push(`✅ Perfect pace: ${wpm} words/min (120-150 is ideal)`);
  } else if (wpm < 80) {
    suggestions.push(`⚠️ Speaking too slowly (${wpm} wpm) - Pick up the pace`);
  } else if (wpm > 180) {
    suggestions.push(`⚠️ Speaking too fast (${wpm} wpm) - Slow down for clarity`);
  }

  // 3. EYE CONTACT DETECTION
  metrics.eyeContactScore = eyeContactScore;
  metrics.facesDetected = facesDetected;
  
  if (eyeContactScore >= 80) {
    score += 2;
    suggestions.push('✅ Excellent eye contact maintained');
  } else if (eyeContactScore >= 60) {
    score += 1;
    suggestions.push(`⚠️ Maintain more eye contact (${eyeContactScore}% detected)`);
  } else {
    suggestions.push(`❌ Poor eye contact (${eyeContactScore}%) - Look at the camera`);
  }

  // 4. RESPONSE LENGTH
  if (wordCount < 50) {
    suggestions.push('⚠️ Response too short - Provide more details');
  } else if (wordCount > 500) {
    suggestions.push('⚠️ Response too long - Be more concise');
  } else {
    score += 1;
    suggestions.push('✅ Good response length');
  }

  // 5. CONTENT QUALITY
  const actionVerbs = ['achieved', 'led', 'managed', 'created', 'delivered', 'improved', 'increased', 'reduced', 'solved', 'implemented'];
  let actionVerbCount = 0;
  
  actionVerbs.forEach(verb => {
    const regex = new RegExp(`\\b${verb}\\b`, 'gi');
    const matches = transcript.match(regex) || [];
    actionVerbCount += matches.length;
  });
  
  metrics.actionVerbs = actionVerbCount;
  
  if (actionVerbCount >= 3) {
    score += 2;
    suggestions.push(`✅ Great use of action verbs (${actionVerbCount} found)`);
  } else if (actionVerbCount > 0) {
    score += 1;
    suggestions.push(`⚠️ Use more action verbs (${actionVerbCount} found - aim for 3+)`);
  } else {
    suggestions.push('❌ Include action verbs (achieved, led, managed, etc.)');
  }

  // Ensure score is 1-10
  score = Math.min(10, Math.max(1, score));

  return {
    score,
    suggestions: [...new Set(suggestions)], // Remove duplicates
    metrics,
    analysis: {
      summary: `${wordCount} words in ${minutesDuration.toFixed(1)}s at ${wpm}wpm`,
      eyeContact: `${eyeContactScore}% contact maintained`,
      fillerWords: `${fillerCount} filler words detected`
    }
  };
}

// WebSocket Connection
wss.on('connection', (ws) => {
  console.log('🎤 New client connected');
  let sessionData = {
    transcript: '',
    startTime: Date.now(),
    eyeContactScores: [],
    facesDetected: 0
  };

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'transcript') {
        console.log('📝 Transcript received:', data.transcript.substring(0, 50));
        sessionData.transcript += ' ' + data.transcript;

      } else if (data.type === 'eye_contact') {
        // Receive eye contact score from frontend
        sessionData.eyeContactScores.push(data.score);
        console.log(`👁️ Eye contact: ${data.score}%`);

      } else if (data.type === 'face_detected') {
        sessionData.facesDetected += 1;

      } else if (data.type === 'start') {
        console.log('🎙️ Recording started');
        sessionData = {
          transcript: '',
          startTime: Date.now(),
          eyeContactScores: [],
          facesDetected: 0
        };
        ws.send(JSON.stringify({ 
          type: 'status', 
          message: 'Recording started - Look at the camera and speak naturally!' 
        }));

      } else if (data.type === 'stop') {
        console.log('⏹️ Recording stopped - Analyzing...');
        
        const duration = (Date.now() - sessionData.startTime) / 1000;
        const avgEyeContact = sessionData.eyeContactScores.length > 0
          ? Math.round(sessionData.eyeContactScores.reduce((a, b) => a + b, 0) / sessionData.eyeContactScores.length)
          : 0;

        const analysis = analyzeTranscript(
          sessionData.transcript,
          duration,
          avgEyeContact,
          sessionData.facesDetected
        );

        console.log('✅ Analysis complete:', analysis);

        ws.send(JSON.stringify({
          type: 'final_analysis',
          transcript: sessionData.transcript.trim(),
          score: analysis.score,
          suggestions: analysis.suggestions,
          metrics: analysis.metrics,
          analysis: analysis.analysis
        }));
      }

    } catch (error) {
      console.error('❌ Error:', error);
      ws.send(JSON.stringify({ 
        type: 'error', 
        message: error.message 
      }));
    }
  });

  ws.on('close', () => {
    console.log('👋 Client disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Enhanced Interview Coach running on http://localhost:${PORT}`);
  console.log(`🎤 WebSocket: ws://localhost:${PORT}`);
  console.log(`\n✨ Features:`);
  console.log(`   ✅ Eye Contact Detection`);
  console.log(`   ✅ Filler Word Counter`);
  console.log(`   ✅ Speaking Pace Analysis`);
  console.log(`   ✅ Advanced Content Scoring`);
});