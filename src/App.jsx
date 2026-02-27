import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import SceneLoader from './components/SceneLoader';
import GridHoverBackground from './components/GridHoverBackground';
import FlappyGameScene, { FlappyCameraRig } from './scenes/FlappyScene';
import MainMenuScene from './scenes/MainMenuScene';
import MinerScene from './scenes/MinerScene';

const LEADERBOARD_LIMIT = 10;
const FLAPPY_CHARACTER_IDS = new Set(['bankr', 'deployer', 'thosmur', 'bankrella', 'bnkrella']);
const FLAPPY_MODEL_LABEL = {
  bankr: 'bankr',
  deployer: 'deployer',
  thosmur: 'thosmur',
  bankrella: 'bnkrella',
  bnkrella: 'bnkrella',
};
const FLAPPY_LEADERBOARD_API_BASE =
  import.meta.env.VITE_FLAPPY_LEADERBOARD_API_BASE || 'https://pqggazplaokncvkhbmaf.supabase.co';
const FLAPPY_LEADERBOARD_API_TOKEN =
  import.meta.env.VITE_FLAPPY_LEADERBOARD_API_TOKEN || 'sb_publishable_0GfOYhDiYqAiSoBPUhifOg_b_B0LWHg';

function normalizePlayers(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  const mapped = entries
    .filter((entry) => entry && typeof entry.name === 'string' && Number.isFinite(Number(entry.score)))
    .map((entry) => ({
      name: entry.name.trim().slice(0, 14) || 'PLAYER',
      score: Number(entry.score),
      model: FLAPPY_CHARACTER_IDS.has(entry.model) ? entry.model : 'bankr',
      createdAt: Number(entry.createdAt) || new Date(entry.created_at || entry.updated_at || Date.now()).getTime(),
    }));

  // Keep best score per player globally.
  const bestByPlayer = new Map();
  for (let i = 0; i < mapped.length; i += 1) {
    const item = mapped[i];
    const key = item.name.toUpperCase();
    const current = bestByPlayer.get(key);
    if (!current || item.score > current.score || (item.score === current.score && item.createdAt < current.createdAt)) {
      bestByPlayer.set(key, item);
    }
  }

  return Array.from(bestByPlayer.values()).sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.createdAt - b.createdAt;
  });
}

function getTopLeaderboard(players) {
  return normalizePlayers(players).slice(0, LEADERBOARD_LIMIT);
}

function getLeaderboardQualification(score, players) {
  if (!Number.isFinite(score) || score <= 0) {
    return null;
  }
  const top = getTopLeaderboard(players);
  if (top.length < LEADERBOARD_LIMIT) {
    return top.length;
  }
  if (score > top[top.length - 1].score) {
    return top.length - 1;
  }
  return null;
}

function insertOrUpdatePlayer(players, name, score, model) {
  const sanitized = normalizePlayers(players);
  const key = name.trim().slice(0, 14).toUpperCase();
  let found = false;
  const next = sanitized.map((entry) => {
    if (entry.name.toUpperCase() !== key) {
      return entry;
    }
    found = true;
    if (score > entry.score) {
      return { name: entry.name, score, model: FLAPPY_MODEL_LABEL[model] || model, createdAt: Date.now() };
    }
    return entry;
  });

  if (!found) {
    next.push({ name: name.trim().slice(0, 14) || 'PLAYER', score, model: FLAPPY_MODEL_LABEL[model] || model, createdAt: Date.now() });
  }

  return normalizePlayers(next);
}

async function fetchRemotePlayers() {
  if (!FLAPPY_LEADERBOARD_API_BASE) {
    return null;
  }
  const response = await fetch(
    `${FLAPPY_LEADERBOARD_API_BASE}/rest/v1/flappy_leaderboard?select=name,score,model,created_at,updated_at&order=score.desc,updated_at.asc&limit=200`,
    {
      headers: {
        apikey: FLAPPY_LEADERBOARD_API_TOKEN,
        Authorization: `Bearer ${FLAPPY_LEADERBOARD_API_TOKEN}`,
      },
    }
  );
  if (!response.ok) {
    throw new Error('Leaderboard fetch failed');
  }
  const payload = await response.json();
  return normalizePlayers(payload ?? []);
}

async function submitRemotePlayer(name, score, model) {
  if (!FLAPPY_LEADERBOARD_API_BASE) {
    return null;
  }
  const response = await fetch(`${FLAPPY_LEADERBOARD_API_BASE}/rest/v1/rpc/submit_flappy_score`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: FLAPPY_LEADERBOARD_API_TOKEN,
      Authorization: `Bearer ${FLAPPY_LEADERBOARD_API_TOKEN}`,
    },
    body: JSON.stringify({
      p_name: name,
      p_score: score,
      p_model: FLAPPY_MODEL_LABEL[model] || model,
    }),
  });
  if (!response.ok) {
    throw new Error('Leaderboard submit failed');
  }
  return fetchRemotePlayers();
}

function normalizeLeaderboard(entries) {
  // Backward compatibility for existing call sites that expect top-10 rows.
  return getTopLeaderboard(entries)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.createdAt - b.createdAt;
    });
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
  const [flappyPlayers, setFlappyPlayers] = useState([]);
  const [isFlappyLeaderboardOpen, setIsFlappyLeaderboardOpen] = useState(false);
  const [pendingLeaderboardScore, setPendingLeaderboardScore] = useState(null);
  const [pendingLeaderboardModel, setPendingLeaderboardModel] = useState('bankr');
  const [leaderboardName, setLeaderboardName] = useState('');
  const [lastSavedScore, setLastSavedScore] = useState(null);
  const [lastSavedModel, setLastSavedModel] = useState('bankr');
  const [flappyCharacterId, setFlappyCharacterId] = useState('bankr');
  const [leaderboardError, setLeaderboardError] = useState('');
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
      fetchRemotePlayers()
        .then((players) => {
          if (players) {
            setFlappyPlayers(players);
          }
        })
        .catch(() => {
          setLeaderboardError('Leaderboard server unavailable');
        });
    } catch {
      setLeaderboardError('Leaderboard server unavailable');
    }
  }, []);

  const flappyLeaderboard = useMemo(() => getTopLeaderboard(flappyPlayers), [flappyPlayers]);

  useEffect(() => {
    if (phase === 'gameover') {
      if (gameoverHandledRef.current) {
        return;
      }
      gameoverHandledRef.current = true;
      const qualificationIndex = getLeaderboardQualification(score, flappyPlayers);
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
  }, [phase, score, flappyPlayers, flappyCharacterId]);

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
    const nextLocal = insertOrUpdatePlayer(flappyPlayers, nextName, pendingLeaderboardScore, pendingLeaderboardModel);
    setFlappyPlayers(nextLocal);
    setLastSavedScore(pendingLeaderboardScore);
    setLastSavedModel(pendingLeaderboardModel);
    setPendingLeaderboardScore(null);
    setLeaderboardName('');
    setIsFlappyLeaderboardOpen(true);
    submitRemotePlayer(nextName, pendingLeaderboardScore, pendingLeaderboardModel)
      .then((players) => {
        if (players) {
          setFlappyPlayers(players);
        }
      })
      .catch(() => {
        setLeaderboardError('Leaderboard server unavailable');
      });
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
                {lastSavedScore === score && <div className="gameover-saved">Saved to Top 10 ({FLAPPY_MODEL_LABEL[lastSavedModel] || lastSavedModel})</div>}
                <div className="leaderboard-title">Top 10</div>
                {leaderboardError && <div className="leaderboard-empty">{leaderboardError}</div>}
                {flappyLeaderboard.length === 0 && <div className="leaderboard-empty">No scores yet</div>}
                {flappyLeaderboard.map((entry, index) => (
                  <div key={`${entry.createdAt}-${entry.name}-${entry.score}`} className="leaderboard-row">
                    <span>{index + 1}.</span>
                    <span>{entry.name} [{FLAPPY_MODEL_LABEL[entry.model] || entry.model}]</span>
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
                <div className="miner-disclaimer-text">Character: {FLAPPY_MODEL_LABEL[pendingLeaderboardModel] || pendingLeaderboardModel}</div>
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
                {leaderboardError && <div className="leaderboard-empty">{leaderboardError}</div>}
                {flappyLeaderboard.length === 0 && <div className="leaderboard-empty">No scores yet</div>}
                {flappyLeaderboard.map((entry, index) => (
                  <div key={`${entry.createdAt}-${entry.name}-${entry.score}`} className="leaderboard-row">
                    <span>{index + 1}.</span>
                    <span>{entry.name} [{FLAPPY_MODEL_LABEL[entry.model] || entry.model}]</span>
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
