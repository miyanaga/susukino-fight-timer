import { useState, useEffect, useRef } from 'react'
import './App.css'

type TimerMode = 'work' | 'rest'
type TimerState = 'idle' | 'running' | 'paused'

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionError extends Event {
  error: string
}

declare global {
  interface Window {
    SpeechRecognition: any
    webkitSpeechRecognition: any
  }
}

function App() {
  const [workTime, setWorkTime] = useState(() => {
    const saved = localStorage.getItem('workTime')
    return saved ? parseInt(saved) : 180 // 3 minutes default
  })
  const [restTime, setRestTime] = useState(() => {
    const saved = localStorage.getItem('restTime')
    return saved ? parseInt(saved) : 60 // 1 minute default
  })
  const [currentTime, setCurrentTime] = useState(() => {
    const saved = localStorage.getItem('workTime')
    return saved ? parseInt(saved) : 180
  })
  const [timerMode, setTimerMode] = useState<TimerMode>('work')
  const [timerState, setTimerState] = useState<TimerState>('idle')
  const [soundPermission, setSoundPermission] = useState(false)
  const [voicePermission, setVoicePermission] = useState(false)
  const [voiceCommandEnabled, setVoiceCommandEnabled] = useState(() => {
    const saved = localStorage.getItem('voiceCommandEnabled')
    return saved === 'true'
  })
  const [recognizedText, setRecognizedText] = useState('')
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth)
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const wakeLockRef = useRef<any>(null)
  const recognitionRef = useRef<any>(null)
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    audioRef.current = new Audio('/bell.mp3')
    
    const handleResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth)
    }
    
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    
    window.addEventListener('resize', handleResize)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      if (wakeLockRef.current) {
        wakeLockRef.current.release()
      }
    }
  }, [])

  useEffect(() => {
    if (timerState === 'running') {
      intervalRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev <= 1) {
            playSound()
            if (timerMode === 'work') {
              setTimerMode('rest')
              return restTime === 0 ? 5 : restTime
            } else {
              setTimerMode('work')
              return workTime === 0 ? 5 : workTime
            }
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [timerState, timerMode, workTime, restTime])

  // Voice command handler
  useEffect(() => {
    if (voiceCommandEnabled && recognizedText) {
      if (recognizedText.includes('ファイトスタート')) {
        if (timerState !== 'running') {
          handleStart()
        }
      } else if (recognizedText.includes('ファイトポーズ')) {
        if (timerState === 'running') {
          handleStart() // This toggles to pause
        }
      } else if (recognizedText.includes('ファイトリセット')) {
        handleReset()
      }
    }
  }, [recognizedText, voiceCommandEnabled])

  const playSound = async () => {
    if (audioRef.current) {
      try {
        // Stop current playback and reset
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        await audioRef.current.play()
      } catch (err) {
        console.error('Failed to play sound:', err)
      }
    }
  }

  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      } catch (err) {
        console.error('Wake Lock error:', err)
      }
    }
  }

  const initSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition()
      recognition.lang = 'ja-JP'
      recognition.continuous = true
      recognition.interimResults = true
      
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        const last = event.results.length - 1
        const text = event.results[last][0].transcript
        setRecognizedText(text)
      }
      
      recognition.onerror = (event: SpeechRecognitionError) => {
        if (event.error === 'no-speech') {
          recognition.stop()
          recognition.start()
        }
      }
      
      recognition.onend = () => {
        if (timerState === 'running') {
          recognition.start()
        }
      }
      
      recognitionRef.current = recognition
      setVoicePermission(true)
      
      try {
        recognition.start()
      } catch (err) {
        console.error('Speech recognition error:', err)
      }
    }
  }

  const handleStart = async () => {
    if (timerState === 'idle') {
      // First time start
      setSoundPermission(true)
      await requestWakeLock()
      if (voiceCommandEnabled) {
        initSpeechRecognition()
      }
      // Set initial time if 0
      if (workTime === 0) {
        setCurrentTime(5)
      }
      // Play sound immediately
      await playSound()
    }
    
    if (timerState === 'running') {
      setTimerState('paused')
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    } else {
      setTimerState('running')
      if (recognitionRef.current && voicePermission) {
        try {
          recognitionRef.current.start()
        } catch (err) {
          console.error('Failed to restart recognition:', err)
        }
      }
    }
  }

  const handleReset = () => {
    setTimerState('idle')
    setTimerMode('work')
    setCurrentTime(workTime === 0 ? 5 : workTime)
    setRecognizedText('')
    
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }

  const adjustWorkTime = (delta: number) => {
    // Round current time to nearest 30 seconds first
    const roundedCurrent = Math.round(workTime / 30) * 30
    const newTime = Math.max(0, roundedCurrent + delta)
    setWorkTime(newTime)
    localStorage.setItem('workTime', newTime.toString())
    if (timerState === 'idle' && timerMode === 'work') {
      setCurrentTime(newTime === 0 ? 5 : newTime)
    }
  }

  const adjustRestTime = (delta: number) => {
    // Round current time to nearest 30 seconds first
    const roundedCurrent = Math.round(restTime / 30) * 30
    const newTime = Math.max(0, roundedCurrent + delta)
    setRestTime(newTime)
    localStorage.setItem('restTime', newTime.toString())
    if (timerState === 'idle' && timerMode === 'rest') {
      setCurrentTime(newTime === 0 ? 5 : newTime)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      try {
        await document.documentElement.requestFullscreen()
      } catch (err) {
        console.error('Failed to enter fullscreen:', err)
      }
    } else {
      try {
        await document.exitFullscreen()
      } catch (err) {
        console.error('Failed to exit fullscreen:', err)
      }
    }
  }

  const toggleVoiceCommand = () => {
    const newValue = !voiceCommandEnabled
    setVoiceCommandEnabled(newValue)
    localStorage.setItem('voiceCommandEnabled', newValue.toString())
    
    // Stop recognition if disabling
    if (!newValue && recognitionRef.current) {
      recognitionRef.current.stop()
      setVoicePermission(false)
      setRecognizedText('')
    }
  }

  return (
    <div className={`app ${isPortrait ? 'portrait' : 'landscape'}`}>
      <button 
        onClick={toggleFullscreen} 
        className="fullscreen-button"
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
      >
        {isFullscreen ? '⛶' : '⛶'}
      </button>
      {isPortrait ? (
        <>
          <img src="/logo.png" alt="Logo" className="logo" />
          <div className={`timer ${timerMode}`}>
            {formatTime(currentTime)}
          </div>
          <div className="controls">
            <button onClick={handleStart} className="control-button">
              {timerState === 'idle' ? 'START' : timerState === 'running' ? 'PAUSE' : 'RESUME'}
            </button>
            <button onClick={handleReset} className="control-button">
              RESET
            </button>
          </div>
          <div className="settings">
            <div className="setting-item">
              <span>Work Time</span>
              <div className="setting-controls">
                <button onClick={() => adjustWorkTime(-30)}>-</button>
                <span>{formatTime(workTime)}</span>
                <button onClick={() => adjustWorkTime(30)}>+</button>
              </div>
            </div>
            <div className="setting-item">
              <span>Rest Time</span>
              <div className="setting-controls">
                <button onClick={() => adjustRestTime(-30)}>-</button>
                <span>{formatTime(restTime)}</span>
                <button onClick={() => adjustRestTime(30)}>+</button>
              </div>
            </div>
          </div>
          <div className="permissions">
            <button 
              onClick={toggleVoiceCommand} 
              className={`voice-toggle ${voiceCommandEnabled ? 'active' : ''}`}
            >
              {voiceCommandEnabled ? 'VOICE ON' : 'VOICE OFF'}
            </button>
            <div className={`permission ${soundPermission ? 'active' : ''}`}>SOUND</div>
            {voiceCommandEnabled && (
              <div className={`permission ${voicePermission ? 'active' : ''}`}>VOICE</div>
            )}
          </div>
          <div className="speech-result">{recognizedText}</div>
        </>
      ) : (
        <>
          <img src="/logo.png" alt="Logo" className="logo" />
          <div className="right-content">
            <div className={`timer ${timerMode}`}>
              {formatTime(currentTime)}
            </div>
            <div className="controls">
              <button onClick={handleStart} className="control-button">
                {timerState === 'idle' ? 'START' : timerState === 'running' ? 'PAUSE' : 'RESUME'}
              </button>
              <button onClick={handleReset} className="control-button">
                RESET
              </button>
            </div>
            <div className="settings">
              <div className="setting-item">
                <span>Work Time</span>
                <div className="setting-controls">
                  <button onClick={() => adjustWorkTime(-30)}>-</button>
                  <span>{formatTime(workTime)}</span>
                  <button onClick={() => adjustWorkTime(30)}>+</button>
                </div>
              </div>
              <div className="setting-item">
                <span>Rest Time</span>
                <div className="setting-controls">
                  <button onClick={() => adjustRestTime(-30)}>-</button>
                  <span>{formatTime(restTime)}</span>
                  <button onClick={() => adjustRestTime(30)}>+</button>
                </div>
              </div>
            </div>
            <div className="permissions">
              <button 
                onClick={toggleVoiceCommand} 
                className={`voice-toggle ${voiceCommandEnabled ? 'active' : ''}`}
              >
                {voiceCommandEnabled ? 'VOICE ON' : 'VOICE OFF'}
              </button>
              <div className={`permission ${soundPermission ? 'active' : ''}`}>SOUND</div>
              {voiceCommandEnabled && (
                <div className={`permission ${voicePermission ? 'active' : ''}`}>VOICE</div>
              )}
            </div>
            <div className="speech-result">{recognizedText}</div>
          </div>
        </>
      )}
    </div>
  )
}

export default App