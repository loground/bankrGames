import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import SceneLoader from './components/SceneLoader';
import GridHoverBackground from './components/GridHoverBackground';
import FlappyGameScene, { FlappyCameraRig } from './scenes/FlappyScene';
import MainMenuScene from './scenes/MainMenuScene';
import MinerScene from './scenes/MinerScene';

const FLAPPY_LEADERBOARD_KEY = 'bankrBird.flappyLeaderboard.v1';
const LEADERBOARD_LIMIT = 10;
const FLAPPY_CHARACTER_IDS = new Set(['bankr', 'deployer', 'thosmur']);

function normalizeLeaderboard(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .filter((entry) => entry && typeof entry.name === 'string' && Number.isFinite(Number(entry.score)))
    .map((entry) => ({
      name: entry.name.trim().slice(0, 14) || 'PLAYER',
      score: Number(entry.score),
      model: FLAPPY_CHARACTER_IDS.has(entry.model) ? entry.model : 'bankr',
      createdAt: Number(entry.createdAt) || Date.now(),
    }))
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.createdAt - b.createdAt;
    })
    .slice(0, LEADERBOARD_LIMIT);
}

function getLeaderboardQualification(score, leaderboard) {
  if (!Number.isFinite(score) || score <= 0) {
    return null;
  }
  const sorted = normalizeLeaderboard(leaderboard);
  if (sorted.length < LEADERBOARD_LIMIT) {
    return sorted.length;
  }
  if (score > sorted[sorted.length - 1].score) {
    return sorted.length - 1;
  }
  return null;
}

function insertLeaderboardEntry(leaderboard, name, score, model) {
  const next = normalizeLeaderboard([
    ...leaderboard,
    { name, score, model, createdAt: Date.now() },
  ]);
  return next.slice(0, LEADERBOARD_LIMIT);
}

export default function App() {
  const [selectedGame, setSelectedGame] = useState(null);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900);
  const menuMusicRef = useRef(null);
  const flappyMusicRef = useRef(null);
  const minerMusicRef = useRef(null);
  const [isMenuMusicPlaying, setIsMenuMusicPlaying] = useState(false);
  const [isFlappyMusicPlaying, setIsFlappyMusicPlaying] = useState(false);
  const [isMinerMusicPlaying, setIsMinerMusicPlaying] = useState(false);
  const [isMenuMusicEnabled, setIsMenuMusicEnabled] = useState(true);
  const [isFlappyMusicEnabled, setIsFlappyMusicEnabled] = useState(true);
  const [isMinerMusicEnabled, setIsMinerMusicEnabled] = useState(true);

  const [phase, setPhase] = useState('ready');
  const [score, setScore] = useState(0);
  const [flappyLeaderboard, setFlappyLeaderboard] = useState([]);
  const [isFlappyLeaderboardOpen, setIsFlappyLeaderboardOpen] = useState(false);
  const [pendingLeaderboardScore, setPendingLeaderboardScore] = useState(null);
  const [pendingLeaderboardModel, setPendingLeaderboardModel] = useState('bankr');
  const [leaderboardName, setLeaderboardName] = useState('');
  const [lastSavedScore, setLastSavedScore] = useState(null);
  const [lastSavedModel, setLastSavedModel] = useState('bankr');
  const [flappyCharacterId, setFlappyCharacterId] = useState('bankr');
  const gameoverHandledRef = useRef(false);
  const [minerPendingUrl, setMinerPendingUrl] = useState(null);
  const [flappyCameraMode, setFlappyCameraMode] = useState('default');
  const [flappyFlightMode, setFlappyFlightMode] = useState('normal');
  const flappyPovMobileCamSettings = useMemo(() => ({
    normal: { backOffset: 1.25, lookAhead: 3.4, targetY: 1, targetZ: 1.15, fov: 110 },
    reverse: { backOffset: 1.25, lookAhead: 3.4, targetY: 1, targetZ: 1.15, fov: 110 },
  }), []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FLAPPY_LEADERBOARD_KEY);
      if (!raw) {
        return;
      }
      setFlappyLeaderboard(normalizeLeaderboard(JSON.parse(raw)));
    } catch {
      setFlappyLeaderboard([]);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(FLAPPY_LEADERBOARD_KEY, JSON.stringify(flappyLeaderboard));
    } catch {
      // ignore storage failures
    }
  }, [flappyLeaderboard]);

  useEffect(() => {
    if (phase === 'gameover') {
      if (gameoverHandledRef.current) {
        return;
      }
      gameoverHandledRef.current = true;
      const qualificationIndex = getLeaderboardQualification(score, flappyLeaderboard);
      if (qualificationIndex !== null) {
        setPendingLeaderboardScore(score);
        setPendingLeaderboardModel(flappyCharacterId);
        setLeaderboardName('');
      }
      return;
    }

    gameoverHandledRef.current = false;
    if (phase === 'ready') {
      setPendingLeaderboardScore(null);
      setLeaderboardName('');
      setLastSavedScore(null);
      setLastSavedModel('bankr');
    }
  }, [phase, score, flappyLeaderboard, flappyCharacterId]);

  useEffect(() => {
    const onResize = () => {
      setIsMobile(window.innerWidth <= 900);
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const canvasCamera = useMemo(
    () => ({ position: [0, 0, isMobile ? 10 : 8], fov: 44 }),
    [isMobile]
  );
  const canvasDpr = isMobile ? 1 : 1.25;

  const hudMessage = useMemo(() => {
    if (phase === 'ready') {
      return 'Click or press Space to start';
    }

    if (phase === 'gameover') {
      return 'Game over - click or press Space to restart';
    }

    return 'Keep flying';
  }, [phase]);

  useEffect(() => {
    const audio = new Audio('/mainSong.mp3');
    audio.loop = true;
    audio.volume = 0.45;
    menuMusicRef.current = audio;

    return () => {
      audio.pause();
      menuMusicRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = new Audio('/flappySong.mp3');
    audio.loop = true;
    audio.volume = 0.45;
    flappyMusicRef.current = audio;

    return () => {
      audio.pause();
      flappyMusicRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = new Audio('/minerSong.mp3');
    audio.loop = true;
    audio.volume = 0.45;
    minerMusicRef.current = audio;

    return () => {
      audio.pause();
      minerMusicRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = menuMusicRef.current;
    if (!audio) {
      return;
    }

    if (selectedGame === null && isMenuMusicEnabled) {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(() => setIsMenuMusicPlaying(true)).catch(() => setIsMenuMusicPlaying(false));
      } else {
        setIsMenuMusicPlaying(true);
      }
      return;
    }

    audio.pause();
    setIsMenuMusicPlaying(false);
  }, [selectedGame, isMenuMusicEnabled]);

  useEffect(() => {
    const audio = flappyMusicRef.current;
    if (!audio) {
      return;
    }

    if (selectedGame === 'flappy' && isFlappyMusicEnabled) {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(() => setIsFlappyMusicPlaying(true)).catch(() => setIsFlappyMusicPlaying(false));
      } else {
        setIsFlappyMusicPlaying(true);
      }
      return;
    }

    audio.pause();
    setIsFlappyMusicPlaying(false);
  }, [selectedGame, isFlappyMusicEnabled]);

  useEffect(() => {
    const audio = minerMusicRef.current;
    if (!audio) {
      return;
    }

    if (selectedGame === 'miner' && isMinerMusicEnabled) {
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise.then(() => setIsMinerMusicPlaying(true)).catch(() => setIsMinerMusicPlaying(false));
      } else {
        setIsMinerMusicPlaying(true);
      }
      return;
    }

    audio.pause();
    setIsMinerMusicPlaying(false);
  }, [selectedGame, isMinerMusicEnabled]);

  const playMenuMusic = () => {
    const audio = menuMusicRef.current;
    if (!audio) {
      return;
    }

    setIsMenuMusicEnabled(true);
    setIsFlappyMusicEnabled(false);
    setIsMinerMusicEnabled(false);
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(() => setIsMenuMusicPlaying(true)).catch(() => setIsMenuMusicPlaying(false));
    } else {
      setIsMenuMusicPlaying(true);
    }
  };

  const stopMenuMusic = () => {
    const audio = menuMusicRef.current;
    if (!audio) {
      return;
    }

    setIsMenuMusicEnabled(false);
    setIsFlappyMusicEnabled(false);
    setIsMinerMusicEnabled(false);
    audio.pause();
    audio.currentTime = 0;
    setIsMenuMusicPlaying(false);
    setIsFlappyMusicPlaying(false);
    setIsMinerMusicPlaying(false);
  };

  const playFlappyMusic = () => {
    const audio = flappyMusicRef.current;
    if (!audio) {
      return;
    }

    setIsMenuMusicEnabled(false);
    setIsFlappyMusicEnabled(true);
    setIsMinerMusicEnabled(false);
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(() => setIsFlappyMusicPlaying(true)).catch(() => setIsFlappyMusicPlaying(false));
    } else {
      setIsFlappyMusicPlaying(true);
    }
  };

  const stopFlappyMusic = () => {
    const audio = flappyMusicRef.current;
    if (!audio) {
      return;
    }

    setIsMenuMusicEnabled(false);
    setIsFlappyMusicEnabled(false);
    setIsMinerMusicEnabled(false);
    audio.pause();
    audio.currentTime = 0;
    setIsMenuMusicPlaying(false);
    setIsFlappyMusicPlaying(false);
    setIsMinerMusicPlaying(false);
  };

  const playMinerMusic = () => {
    const audio = minerMusicRef.current;
    if (!audio) {
      return;
    }

    setIsMenuMusicEnabled(false);
    setIsFlappyMusicEnabled(false);
    setIsMinerMusicEnabled(true);
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.then === 'function') {
      playPromise.then(() => setIsMinerMusicPlaying(true)).catch(() => setIsMinerMusicPlaying(false));
    } else {
      setIsMinerMusicPlaying(true);
    }
  };

  const stopMinerMusic = () => {
    const audio = minerMusicRef.current;
    if (!audio) {
      return;
    }

    setIsMenuMusicEnabled(false);
    setIsFlappyMusicEnabled(false);
    setIsMinerMusicEnabled(false);
    audio.pause();
    audio.currentTime = 0;
    setIsMenuMusicPlaying(false);
    setIsFlappyMusicPlaying(false);
    setIsMinerMusicPlaying(false);
  };

  const openMinerDisclaimer = (url) => {
    setMinerPendingUrl(url);
  };

  const agreeAndOpenMinerLink = () => {
    if (!minerPendingUrl) {
      return;
    }

    window.open(minerPendingUrl, '_blank', 'noopener,noreferrer');
    setMinerPendingUrl(null);
  };

  const closeMinerDisclaimer = () => {
    setMinerPendingUrl(null);
  };

  const submitLeaderboardScore = () => {
    if (pendingLeaderboardScore === null) {
      return;
    }

    const nextName = leaderboardName.trim().slice(0, 14) || 'PLAYER';
    const nextBoard = insertLeaderboardEntry(flappyLeaderboard, nextName, pendingLeaderboardScore, pendingLeaderboardModel);
    setFlappyLeaderboard(nextBoard);
    setLastSavedScore(pendingLeaderboardScore);
    setLastSavedModel(pendingLeaderboardModel);
    setPendingLeaderboardScore(null);
    setLeaderboardName('');
    setIsFlappyLeaderboardOpen(true);
  };

  return (
    <div className="app">
      {selectedGame === null && (
        <>
          <GridHoverBackground />
          <Suspense fallback={<SceneLoader title="Loading Main Menu..." />}>
            <Canvas
              className="main-menu-canvas"
              camera={{ position: [0, 0, 7], fov: 42 }}
              dpr={canvasDpr}
              gl={{ alpha: true, antialias: true }}
            >
              <MainMenuScene isMobile={isMobile} />
            </Canvas>
          </Suspense>

          <div className="selection-screen">
            <div className="selection-disclaimer">not affilated with official bankr bot project or token</div>
            <img className="selection-top-image" src="/bgMainPage.png" alt="Main page banner" />
            <div className="selection-title">Select game</div>
            <button
              className="game-option"
              type="button"
              onClick={() => {
                setFlappyCameraMode('default');
                setFlappyFlightMode('normal');
                setSelectedGame('flappy');
              }}
            >
              Flappy Bankr
            </button>
            <button
              className="game-option"
              type="button"
              onClick={() => {
                setSelectedGame('miner');
              }}
            >
              Miner
            </button>
          </div>
          <div className="main-audio-controls">
            <button className="mini-control" type="button" onClick={stopMenuMusic}>
              Stop
            </button>
            <button className="mini-control" type="button" onClick={playMenuMusic}>
              {isMenuMusicPlaying ? 'Playing' : 'Play'}
            </button>
          </div>
        </>
      )}

      {selectedGame === 'miner' && (
        <>
          <div className="flappy-audio-controls" onPointerDown={(event) => event.stopPropagation()}>
            <button className="mini-control" type="button" onClick={stopMinerMusic}>
              Stop
            </button>
            <button className="mini-control" type="button" onClick={playMinerMusic}>
              {isMinerMusicPlaying ? 'Playing' : 'Play'}
            </button>
          </div>

          <div className="flappy-back">
            <button
              className="game-option"
              type="button"
              onClick={() => {
                setSelectedGame(null);
                setMinerPendingUrl(null);
              }}
            >
              Back
            </button>
          </div>
          <Suspense fallback={<SceneLoader title="Loading Miner Scene..." />}>
            <Canvas camera={canvasCamera} dpr={canvasDpr} shadows>
              <MinerScene />
            </Canvas>
          </Suspense>
          <div className="hud miner-hud">
            <img className="miner-top-image" src="/gemMiner.png" alt="Gem Miner" />
            <div className="miner-bottom-stack">
              <div className="message miner-description">
                dig underground -&gt; cashout -&gt; tokens hit your wallet. no app, no download, just go an play.
                It&apos;s NFT gated: Gem Mining Pickaxe to cashout (0.001eth).
              </div>
              <div className="miner-actions" onPointerDown={(event) => event.stopPropagation()}>
                <button className="game-option miner-action-button" type="button" onClick={() => openMinerDisclaimer('https://www.gemminer.app')}>
                  Play
                </button>
                <button
                  className="game-option miner-action-button"
                  type="button"
                  onClick={() => openMinerDisclaimer('https://www.netprotocol.app/app/inscribed-drops/mint/base/203')}
                >
                  Mint Axe
                </button>
              </div>
            </div>
          </div>

          {minerPendingUrl && (
            <div className="miner-disclaimer-overlay" onPointerDown={(event) => event.stopPropagation()}>
              <div className="miner-disclaimer-card">
                <div className="miner-disclaimer-text">
                  The project is not affilated with the dev of the arcade
                </div>
                <div className="miner-disclaimer-text">
                  creator:{' '}
                  <a href="https://x.com/Simple_on_Base" target="_blank" rel="noreferrer">
                    https://x.com/Simple_on_Base
                  </a>
                </div>
                <div className="miner-disclaimer-actions">
                  <button
                    className="game-option miner-action-button"
                    type="button"
                    onClick={agreeAndOpenMinerLink}
                  >
                    Agree
                  </button>
                  <button
                    className="game-option miner-action-button"
                    type="button"
                    onClick={closeMinerDisclaimer}
                  >
                    Back
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {selectedGame === 'flappy' && (
        <>
          <div className="flappy-audio-controls" onPointerDown={(event) => event.stopPropagation()}>
            <button className="mini-control" type="button" onClick={stopFlappyMusic}>
              Stop
            </button>
            <button className="mini-control" type="button" onClick={playFlappyMusic}>
              {isFlappyMusicPlaying ? 'Playing' : 'Play'}
            </button>
          </div>

          <div className="flappy-back">
            <button
              className="game-option"
              type="button"
              onClick={() => {
                setSelectedGame(null);
                setPhase('ready');
                setScore(0);
                setFlappyCameraMode('default');
                setFlappyFlightMode('normal');
                setFlappyCharacterId('bankr');
                setIsFlappyLeaderboardOpen(false);
                setPendingLeaderboardScore(null);
              }}
            >
              Back
            </button>
          </div>

          {phase === 'ready' && (
            <div className="flappy-leaderboard-button" onPointerDown={(event) => event.stopPropagation()}>
              <button className="mini-control" type="button" onClick={() => setIsFlappyLeaderboardOpen(true)}>
                Leaderboard
              </button>
            </div>
          )}

          {phase === 'ready' && (
            <div className="game-title">
              <img src="/name.png" alt="Game title" />
            </div>
          )}

          {/*
            <div className="flappy-mode-panel" onPointerDown={(event) => event.stopPropagation()}>
              <div className="flappy-mode-title">Flappy Modes</div>
              <div className="flappy-mode-row">
                <button
                  className={`mini-control ${flappyCameraMode === 'default' ? 'mini-control-active' : ''}`}
                  type="button"
                  onClick={() => setFlappyCameraMode('default')}
                >
                  Cam: Default
                </button>
                <button
                  className={`mini-control ${flappyCameraMode === 'pov' ? 'mini-control-active' : ''}`}
                  type="button"
                  onClick={() => setFlappyCameraMode('pov')}
                >
                  Cam: POV
                </button>
              </div>
              <div className="flappy-mode-row">
                <button
                  className={`mini-control ${flappyFlightMode === 'normal' ? 'mini-control-active' : ''}`}
                  type="button"
                  onClick={() => setFlappyFlightMode('normal')}
                >
                  Dir: Normal
                </button>
                <button
                  className={`mini-control ${flappyFlightMode === 'reverse' ? 'mini-control-active' : ''}`}
                  type="button"
                  onClick={() => setFlappyFlightMode('reverse')}
                >
                  Dir: Reverse
                </button>
              </div>
              {flappyCameraMode === 'pov' && (
                <div className="flappy-tune-group">
                  <div className="flappy-mode-title">POV Camera Profile</div>
                  <div className="flappy-mode-row">
                    <button
                      className={`mini-control ${flappyCamEditDirection === 'normal' ? 'mini-control-active' : ''}`}
                      type="button"
                      onClick={() => setFlappyCamEditDirection('normal')}
                    >
                      Edit Normal
                    </button>
                    <button
                      className={`mini-control ${flappyCamEditDirection === 'reverse' ? 'mini-control-active' : ''}`}
                      type="button"
                      onClick={() => setFlappyCamEditDirection('reverse')}
                    >
                      Edit Reverse
                    </button>
                  </div>
                  <div className="flappy-tune-row">
                    <span className="flappy-tune-label">Back</span>
                    <button
                      className="mini-control"
                      type="button"
                      onClick={() => updateFlappyCamDraft('backOffset', -0.1, 0.3, 4, 2)}
                    >
                      -
                    </button>
                    <span className="flappy-tune-value">{flappyPovMobileCamDraft[flappyCamEditDirection].backOffset.toFixed(2)}</span>
                    <button
                      className="mini-control"
                      type="button"
                      onClick={() => updateFlappyCamDraft('backOffset', 0.1, 0.3, 4, 2)}
                    >
                      +
                    </button>
                  </div>
                  <div className="flappy-tune-row">
                    <span className="flappy-tune-label">Ahead</span>
                    <button
                      className="mini-control"
                      type="button"
                      onClick={() => updateFlappyCamDraft('lookAhead', -0.1, 1, 8, 2)}
                    >
                      -
                    </button>
                    <span className="flappy-tune-value">{flappyPovMobileCamDraft[flappyCamEditDirection].lookAhead.toFixed(2)}</span>
                    <button
                      className="mini-control"
                      type="button"
                      onClick={() => updateFlappyCamDraft('lookAhead', 0.1, 1, 8, 2)}
                    >
                      +
                    </button>
                  </div>
                  <div className="flappy-tune-row">
                    <span className="flappy-tune-label">Y</span>
                    <button
                      className="mini-control"
                      type="button"
                      onClick={() => updateFlappyCamDraft('targetY', -0.05, -1, 3, 2)}
                    >
                      -
                    </button>
                    <span className="flappy-tune-value">{flappyPovMobileCamDraft[flappyCamEditDirection].targetY.toFixed(2)}</span>
                    <button
                      className="mini-control"
                      type="button"
                      onClick={() => updateFlappyCamDraft('targetY', 0.05, -1, 3, 2)}
                    >
                      +
                    </button>
                  </div>
                  <div className="flappy-tune-row">
                    <span className="flappy-tune-label">Z</span>
                    <button
                      className="mini-control"
                      type="button"
                      onClick={() => updateFlappyCamDraft('targetZ', -0.05, 0.1, 6, 2)}
                    >
                      -
                    </button>
                    <span className="flappy-tune-value">{flappyPovMobileCamDraft[flappyCamEditDirection].targetZ.toFixed(2)}</span>
                    <button
                      className="mini-control"
                      type="button"
                      onClick={() => updateFlappyCamDraft('targetZ', 0.05, 0.1, 6, 2)}
                    >
                      +
                    </button>
                  </div>
                  <div className="flappy-tune-row">
                    <span className="flappy-tune-label">FOV</span>
                    <button
                      className="mini-control"
                      type="button"
                      onClick={() => updateFlappyCamDraft('fov', -1, 45, 120, 0)}
                    >
                      -
                    </button>
                    <span className="flappy-tune-value">{flappyPovMobileCamDraft[flappyCamEditDirection].fov}</span>
                    <button
                      className="mini-control"
                      type="button"
                      onClick={() => updateFlappyCamDraft('fov', 1, 45, 120, 0)}
                    >
                      +
                    </button>
                  </div>
                  <button className="mini-control mini-control-apply" type="button" onClick={applyFlappyCamDraft}>
                    Apply
                  </button>
                </div>
              )}
            </div>
          */}

          <Suspense fallback={<SceneLoader title="Loading Flappy Bankr..." />}>
            <Canvas camera={canvasCamera} dpr={canvasDpr}>
              <FlappyCameraRig
                phase={phase}
                isMobile={isMobile}
                cameraMode={flappyCameraMode}
                flightMode={flappyFlightMode}
                povMobileCamSettings={flappyPovMobileCamSettings}
              />
              <FlappyGameScene
                phase={phase}
                setPhase={setPhase}
                score={score}
                setScore={setScore}
                isMobile={isMobile}
                flightMode={flappyFlightMode}
                setFlightMode={setFlappyFlightMode}
                cameraMode={flappyCameraMode}
                setCameraMode={setFlappyCameraMode}
                onCharacterChange={setFlappyCharacterId}
              />
            </Canvas>
          </Suspense>

          <div className="hud">
            {phase === 'playing' && <div className="flappy-score">Score: {score}</div>}
            <div className="message flappy-message">{hudMessage}</div>
            {phase === 'gameover' && (
              <div className="gameover-score gameover-leaderboard">
                <div>Your Score: {score}</div>
                {lastSavedScore === score && <div className="gameover-saved">Saved to Top 10 ({lastSavedModel})</div>}
                <div className="leaderboard-title">Top 10</div>
                {flappyLeaderboard.length === 0 && <div className="leaderboard-empty">No scores yet</div>}
                {flappyLeaderboard.map((entry, index) => (
                  <div key={`${entry.createdAt}-${entry.name}-${entry.score}`} className="leaderboard-row">
                    <span>{index + 1}.</span>
                    <span>{entry.name} [{entry.model}]</span>
                    <span>{entry.score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {pendingLeaderboardScore !== null && (
            <div className="miner-disclaimer-overlay" onPointerDown={(event) => event.stopPropagation()}>
              <div className="miner-disclaimer-card">
                <div className="miner-disclaimer-text">New Top 10 score: {pendingLeaderboardScore}</div>
                <div className="miner-disclaimer-text">Character: {pendingLeaderboardModel}</div>
                <div className="miner-disclaimer-text">Enter your name</div>
                <input
                  className="leaderboard-input"
                  value={leaderboardName}
                  onChange={(event) => setLeaderboardName(event.target.value)}
                  maxLength={14}
                  placeholder="PLAYER"
                />
                <div className="miner-disclaimer-actions">
                  <button className="game-option miner-action-button" type="button" onClick={submitLeaderboardScore}>
                    Save
                  </button>
                </div>
              </div>
            </div>
          )}

          {isFlappyLeaderboardOpen && (
            <div className="miner-disclaimer-overlay" onPointerDown={(event) => event.stopPropagation()}>
              <div className="miner-disclaimer-card">
                <div className="leaderboard-title">Flappy Top 10</div>
                {flappyLeaderboard.length === 0 && <div className="leaderboard-empty">No scores yet</div>}
                {flappyLeaderboard.map((entry, index) => (
                  <div key={`${entry.createdAt}-${entry.name}-${entry.score}`} className="leaderboard-row">
                    <span>{index + 1}.</span>
                    <span>{entry.name} [{entry.model}]</span>
                    <span>{entry.score}</span>
                  </div>
                ))}
                <div className="miner-disclaimer-actions">
                  <button className="game-option miner-action-button" type="button" onClick={() => setIsFlappyLeaderboardOpen(false)}>
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
