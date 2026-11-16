import fs from 'fs';

const ponteIconsCode = fs.readFileSync('ponte-icons.js', 'utf8');
const stylesCss = fs.readFileSync('styles.css', 'utf8');
const ozproMarkSvg = fs.readFileSync('brand/ozpro-mark.svg', 'utf8');
const clientJs = fs.readFileSync('rotas-pro.js', 'utf8');
const mapsEngineJs = fs.readFileSync('ponte-maps-engine.js', 'utf8');

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Rotas & Mapas Pro • Console Oficial Anycast • Ponte API Market</title>
  <meta name="description" content="Motor Soberano de Mapas, Rotas, Tracking de Entregas e Viagens ao Vivo (estilo Uber/iFood), Logística Rodoviária ANTT com Praças de Pedágio, Otimizador Multi-Paradas TSP e Geocodificação Reversa IBGE na Cloudflare Edge." />
  <link rel="stylesheet" href="styles.css?v=4.0.0" />
  <script>
    (function() {
      const savedTheme = localStorage.getItem('ponte.theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.setAttribute('data-theme', savedTheme);
    })();
  </script>
  <script>
${ponteIconsCode}
  </script>
  <style>
    svg.lucide, .lucide {
      width: 18px !important;
      height: 18px !important;
      stroke-width: 2 !important;
      display: inline-block;
      vertical-align: middle;
    }
    .playground-split {
      display: grid;
      grid-template-columns: minmax(0, 1.3fr) minmax(0, 0.7fr);
      gap: 24px;
      margin-top: 22px;
    }
    @media (max-width: 1100px) {
      .playground-split { grid-template-columns: 1fr; }
    }
    .playground-left, .playground-right {
      min-width: 0 !important;
    }
    .map-viewport-frame {
      position: relative;
      background: #090e1a;
      border: 1px solid var(--line);
      border-radius: var(--radius-xl);
      overflow: hidden;
      margin-bottom: 18px;
      height: 510px;
      box-shadow: 0 18px 40px -10px rgba(0, 0, 0, 0.40);
      user-select: none;
    }
    @media (max-width: 768px) {
      .map-viewport-frame {
        height: 390px;
      }
    }
    .map-viewport-frame.is-fullscreen {
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 9990 !important;
      border-radius: 0 !important;
      margin: 0 !important;
    }
    .map-search-overlay {
      position: absolute;
      top: 14px;
      left: 14px;
      right: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      pointer-events: none;
      z-index: 20;
      flex-wrap: wrap;
    }
    .map-search-box {
      pointer-events: auto;
      display: flex;
      align-items: center;
      gap: 6px;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.16);
      backdrop-filter: blur(12px);
      border-radius: 12px;
      padding: 4px 6px 4px 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
      max-width: 340px;
      width: 100%;
    }
    .map-search-box input {
      flex: 1;
      background: transparent;
      border: none;
      color: #f8fafc;
      font-size: 12.5px;
      font-weight: 600;
      outline: none;
      min-width: 120px;
    }
    .map-layers-bar {
      pointer-events: auto;
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .map-layer-pill {
      height: 32px;
      padding: 0 10px;
      border-radius: 9px;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: #cbd5e1;
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      backdrop-filter: blur(10px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
    }
    .map-layer-pill.is-active {
      border-color: #a3e635;
      color: #a3e635;
      background: rgba(20, 35, 25, 0.95);
    }
    .map-zoom-controls {
      position: absolute;
      bottom: 20px;
      right: 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      z-index: 20;
    }
    .map-place-popup {
      position: absolute;
      bottom: 16px;
      left: 14px;
      max-width: 330px;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(56, 189, 248, 0.45);
      border-radius: 12px;
      padding: 12px 14px;
      color: #f8fafc;
      z-index: 25;
      backdrop-filter: blur(12px);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
      display: none;
    }
    .map-zoom-btn {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      background: rgba(15, 23, 42, 0.90);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #f8fafc;
      font-weight: 800;
      font-size: 16px;
      display: grid;
      place-items: center;
      cursor: pointer;
      backdrop-filter: blur(8px);
    }
    .map-zoom-btn:hover {
      border-color: var(--mint);
      color: var(--mint);
    }
    .tab-nav-bar {
      display: flex;
      gap: 8px;
      background: var(--paper-elevated, #f1f5f2);
      padding: 6px;
      border-radius: var(--radius-lg);
      border: 1px solid var(--line);
      margin-bottom: 22px;
      overflow-x: auto;
    }
    :root[data-theme="dark"] .tab-nav-bar {
      background: #0d1527;
      border-color: #1e293b;
    }
    .tab-nav-btn {
      flex: 1;
      min-height: 40px;
      padding: 0 15px;
      border: none;
      background: transparent;
      border-radius: var(--radius-md);
      font-size: 12.5px;
      font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      white-space: nowrap;
      transition: all 0.16s ease;
    }
    .tab-nav-btn.is-active {
      background: var(--paper);
      color: var(--ink);
      font-weight: 800;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    :root[data-theme="dark"] .tab-nav-btn.is-active {
      background: #1e293b;
      color: #fff;
    }
    .card-dashboard {
      background: var(--paper);
      border: 1px solid var(--line);
      border-radius: var(--radius-xl);
      padding: 22px;
      box-shadow: var(--shadow-sm);
    }
    .status-badge-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 11px;
      border-radius: var(--radius-full);
      font-size: 11.5px;
      font-weight: 700;
    }
    .status-badge-pill.green {
      background: rgba(16, 185, 129, 0.12);
      color: #10b981;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .status-badge-pill.blue {
      background: rgba(59, 130, 246, 0.12);
      color: #3b82f6;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .status-badge-pill.amber {
      background: rgba(245, 158, 11, 0.12);
      color: #f59e0b;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .specs-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .specs-table tr {
      border-bottom: 1px solid var(--line-light);
    }
    .specs-table td {
      padding: 11px 14px;
      vertical-align: middle;
    }
    .specs-table td.label-col {
      color: var(--muted);
      font-weight: 600;
      width: 42%;
      font-size: 11.5px;
      text-transform: uppercase;
    }
    .specs-table td.val-col {
      color: var(--ink);
      font-weight: 700;
      text-align: right;
    }
    .terminal-window {
      background: #091311;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: var(--radius-xl);
      overflow: hidden;
      box-shadow: var(--shadow-xl);
      display: flex;
      flex-direction: column;
    }
    .terminal-topbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 11px 16px;
      background: rgba(255, 255, 255, 0.04);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }
    .terminal-dots { display: flex; gap: 7px; }
    .terminal-dot { width: 11px; height: 11px; border-radius: 50%; }
    .terminal-dot.red { background: #ef4444; }
    .terminal-dot.yellow { background: #f59e0b; }
    .terminal-dot.green { background: #10b981; }
    .modal-chip {
      height: 32px;
      padding: 0 12px;
      border-radius: 8px;
      font-size: 11.5px;
      font-weight: 700;
      border: 1px solid var(--line);
      background: var(--paper);
      color: var(--muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .modal-chip.is-active {
      border-color: var(--blue);
      color: var(--blue);
      background: rgba(59, 130, 246, 0.1);
    }

    @media (min-width: 851px) {
      .sidebar-drawer-close, .mobile-hamburger-btn, .mobile-bottom-nav {
        display: none !important;
      }
    }

    @media (max-width: 850px) {
      html, body, .app-shell, .main-area, .content-wrap {
        overflow-x: hidden !important;
        width: 100% !important;
        max-width: 100vw !important;
        box-sizing: border-box !important;
      }
      .app-shell { grid-template-columns: 1fr !important; }
      .sidebar {
        position: fixed !important;
        top: 0 !important;
        left: -320px !important;
        bottom: 0 !important;
        width: 285px !important;
        max-width: 85vw !important;
        z-index: 100 !important;
        transition: left 0.25s cubic-bezier(0.16, 1, 0.3, 1) !important;
        display: flex !important;
      }
      .sidebar.is-open { left: 0 !important; }
      .mobile-hamburger-btn, .sidebar-drawer-close { display: grid !important; }
      .environment { display: none !important; }
      .content-wrap { padding: 12px 12px 80px !important; }
      .mobile-bottom-nav {
        position: fixed !important;
        bottom: 0 !important;
        left: 0 !important;
        right: 0 !important;
        height: 62px !important;
        background: rgba(15, 23, 42, 0.95) !important;
        backdrop-filter: blur(12px) !important;
        border-top: 1px solid rgba(255, 255, 255, 0.08) !important;
        display: flex !important;
        justify-content: space-around !important;
        align-items: center !important;
        z-index: 90 !important;
      }
      .mobile-nav-item {
        flex: 1 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        gap: 3px !important;
        background: transparent !important;
        border: none !important;
        color: #94a3b8 !important;
        font-size: 10.5px !important;
        font-weight: 600 !important;
      }
      .mobile-nav-item.is-active {
        color: #a3e635 !important;
        font-weight: 800 !important;
      }
    }
  </style>
</head>
<body>
  <div class="sidebar-drawer-backdrop" id="sidebar-drawer-backdrop" hidden></div>
  <div class="app-shell">
    <!-- Sidebar Oficial -->
    <aside class="sidebar" aria-label="Navegação principal">
      <button class="sidebar-drawer-close" id="sidebar-drawer-close" aria-label="Fechar menu lateral"><i data-lucide="x"></i></button>
      <a class="brand" href="#playground" aria-label="Ponte API, Rotas Pro">
        <img src="brand/ozpro-mark.svg" alt="Ponte API Logo" style="width:38px;height:38px;border-radius:10px;object-fit:contain;background:var(--mint);padding:4px;box-shadow:0 4px 12px rgba(163,230,53,0.35);" />
        <span><strong>ponte</strong><small>ROTAS & MAPAS PRO</small></span>
      </a>

      <nav class="primary-nav" id="primary-nav">
        <div class="nav-section-label">MÓDULOS DE GEOLOCALIZAÇÃO</div>
        <button class="nav-link is-active" data-view="tracking">
          <i data-lucide="compass"></i> <span>Mapa & Tracking Uber/iFood</span>
        </button>
        <button class="nav-link" data-view="otimizador">
          <i data-lucide="shuffle"></i> <span>Otimizador Multi-Paradas (TSP)</span>
        </button>
        <button class="nav-link" data-view="pedagios">
          <i data-lucide="receipt"></i> <span>Rodovias & Pedágios ANTT</span>
        </button>
        <button class="nav-link" data-view="geocoding">
          <i data-lucide="map-pin"></i> <span>Geocodificação & CEP Reverso</span>
        </button>

        <div class="nav-section-label">ECOSSISTEMA CONECTADO</div>
        <a class="nav-link" href="https://placas-pro-api.clepta2.workers.dev" target="_blank" rel="noopener">
          <i data-lucide="car"></i> <span>Placas & Veículos Pro</span>
          <span class="nav-ext"><i data-lucide="arrow-up-right"></i></span>
        </a>
        <a class="nav-link" href="https://ceps-pro-api.vicknovais03.workers.dev" target="_blank" rel="noopener">
          <i data-lucide="globe"></i> <span>CEPs & DNE Pro</span>
          <span class="nav-ext"><i data-lucide="arrow-up-right"></i></span>
        </a>
        <a class="nav-link" href="https://github.com/clepta2/rotas-pro" target="_blank" rel="noopener">
          <i data-lucide="terminal"></i> <span>GitHub do Projeto</span>
          <span class="nav-ext"><i data-lucide="arrow-up-right"></i></span>
        </a>
      </nav>

      <div class="sidebar-bottom">
        <div class="status-row">
          <span class="status-dot connected"></span>
          <span>Cloudflare Edge · &lt;2ms</span>
        </div>
        <div class="profile-row">
          <div class="avatar lg">RP</div>
          <div class="profile-copy">
            <strong>Rotas & Mapas Pro</strong>
            <span>5.570 Cidades · Zero 3ºs</span>
          </div>
        </div>
        <div class="sidebar-version">v1.0.0 · IBGE · DNE · ANTT</div>
      </div>
    </aside>

    <!-- Área Principal -->
    <main class="main-area">
      <header class="topbar">
        <button class="mobile-hamburger-btn" id="mobile-hamburger-btn" aria-label="Abrir menu lateral"><i data-lucide="menu"></i></button>
        <div class="breadcrumb">
          <span>Workspace</span>
          <i data-lucide="chevron-right"></i>
          <span>Logística & Mobilidade</span>
          <i data-lucide="chevron-right"></i>
          <strong id="breadcrumb-title">Mapa & Tracking Uber/iFood</strong>
        </div>
        <div class="topbar-actions">
          <span class="environment">
            <span class="status-dot connected"></span>
            100% Soberano (Zero Google Maps / Mapbox)
          </span>
          <button class="icon-button theme-toggle-btn" id="theme-toggle-btn" aria-label="Alternar tema" title="Alternar tema claro/escuro">
            <i data-lucide="moon"></i>
          </button>
          <a href="https://github.com/clepta2/my-api-marketplace" target="_blank" rel="noopener" class="primary-button accent" style="text-decoration:none;display:inline-flex;align-items:center;gap:7px;font-size:12.5px;padding:0 16px;height:36px;">
            <i data-lucide="sparkles"></i> <span>Ponte Marketplace</span>
          </a>
        </div>
      </header>

      <div class="content-wrap">
        <div class="page-heading">
          <div>
            <p class="eyebrow">MOBILIDADE URBANA, TRACKING EM TEMPO REAL & LOGÍSTICA ANTT</p>
            <h1>Rotas & Mapas Pro • Console Oficial Anycast</h1>
            <p class="page-subtitle">
              Roteamento urbano e rodoviário, telemetria de entregas ao vivo a 60fps (estilo Uber / iFood), otimizador de múltiplas paradas (TSP 2-Opt), praças de pedágio, custo real de combustível ANP e cobrança Pix integrada.
            </p>
          </div>
        </div>

        <!-- Destaques -->
        <div class="billing-models-grid" style="grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin-bottom: 22px;">
          <div class="model-card credit-card" style="padding:16px 20px;">
            <div class="model-card-header" style="margin-bottom:8px;">
              <span class="model-badge credit"><i data-lucide="compass"></i> TRACKING 60FPS</span>
            </div>
            <div style="font-size:19px;font-weight:800;color:var(--ink);margin-bottom:4px;">Estilo Uber & iFood</div>
            <p style="font-size:12px;color:var(--muted);margin:0;">Mapa vetorial com posição ao vivo do motorista, bússola, ETA e progresso em tempo real.</p>
          </div>
          <div class="model-card subscription-card" style="padding:16px 20px;">
            <div class="model-card-header" style="margin-bottom:8px;">
              <span class="model-badge sub"><i data-lucide="shuffle"></i> ALGORITMO TSP 2-OPT</span>
            </div>
            <div style="font-size:19px;font-weight:800;color:var(--ink);margin-bottom:4px;">Roteirizador Multi-Stop</div>
            <p style="font-size:12px;color:var(--muted);margin:0;">Reordena dezenas de entregas instantaneamente para o menor trajeto e menor gasto de combustível.</p>
          </div>
          <div class="model-card tier-card" style="padding:16px 20px;">
            <div class="model-card-header" style="margin-bottom:8px;">
              <span class="model-badge tier"><i data-lucide="shield-check"></i> ECOSSISTEMA PLUGADO</span>
            </div>
            <div style="font-size:19px;font-weight:800;color:var(--ink);margin-bottom:4px;">CEPs + Placas + ANP + Pix</div>
            <p style="font-size:12px;color:var(--muted);margin:0;">Cruza consumo Inmetro da placa, preço da gasolina na UF, pedágios e gera QR Code Pix da corrida.</p>
          </div>
        </div>

        <!-- Abas -->
        <div class="tab-nav-bar">
          <button class="tab-nav-btn is-active" data-tab="tracking">
            <i data-lucide="compass"></i> <span>Mapa & Tracking Ao Vivo</span>
          </button>
          <button class="tab-nav-btn" data-tab="otimizador">
            <i data-lucide="shuffle"></i> <span>Otimizador Multi-Paradas (TSP)</span>
          </button>
          <button class="tab-nav-btn" data-tab="pedagios">
            <i data-lucide="receipt"></i> <span>Rodovias & Pedágios ANTT</span>
          </button>
          <button class="tab-nav-btn" data-tab="geocoding">
            <i data-lucide="map-pin"></i> <span>Geocodificação & CEP Reverso</span>
          </button>
        </div>

        <div class="playground-split">
          <!-- Coluna Esquerda: Mapa Interativo e Painéis -->
          <div class="playground-left">
            <!-- PAINEL 1: MAPA & TRACKING AO VIVO -->
            <div id="section-tracking" class="tab-pane">
              <div class="card-dashboard">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
                  <span style="font-size:14px;font-weight:800;color:var(--ink);display:flex;align-items:center;gap:8px;">
                    <i data-lucide="compass" style="color:var(--blue);"></i>
                    <span>Simulador de Viagem & Entrega em Tempo Real</span>
                  </span>
                  <span class="status-badge-pill green" id="live-status-pill">EM DESLOCAMENTO</span>
                </div>

                <!-- Inputs de Origem, Botão Inverter (A <-> B) e Destino -->
                <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:end;margin-bottom:12px;">
                  <div>
                    <label style="display:block;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;">PONTO DE PARTIDA (A)</label>
                    <input type="text" id="rota-origem" value="01310-100" placeholder="CEP, Cidade ou Coordenada..." style="width:100%;height:40px;padding:0 12px;border:1px solid var(--line);border-radius:var(--radius-md);font-size:13px;font-weight:700;color:var(--ink);background:var(--paper);" />
                  </div>
                  <button id="btn-swap-routes" class="secondary-button" title="Inverter Origem e Destino (A ⇄ B)" style="height:40px;width:40px;padding:0;display:grid;place-items:center;border-radius:var(--radius-md);">
                    <i data-lucide="shuffle" style="width:16px;height:16px;"></i>
                  </button>
                  <div>
                    <label style="display:block;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;">DESTINO FINAL (B)</label>
                    <input type="text" id="rota-destino" value="04538-133" placeholder="CEP, Cidade ou Coordenada..." style="width:100%;height:40px;padding:0 12px;border:1px solid var(--line);border-radius:var(--radius-md);font-size:13px;font-weight:700;color:var(--ink);background:var(--paper);" />
                  </div>
                </div>

                <!-- Seletor de Modal, Placa e Botões -->
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
                  <div style="display:flex;gap:6px;flex-wrap:wrap;">
                    <button class="modal-chip is-active" data-modal="carro"><i data-lucide="car"></i> <span>Carro (Uber)</span></button>
                    <button class="modal-chip" data-modal="moto"><i data-lucide="bike"></i> <span>Moto (iFood)</span></button>
                    <button class="modal-chip" data-modal="caminhao"><i data-lucide="layers"></i> <span>Caminhão ANTT</span></button>
                  </div>
                  <div style="display:flex;gap:8px;align-items:center;">
                    <input type="text" id="rota-placa" value="BRA2E19" maxlength="8" title="Placa do Veículo (Integração Placas Pro)" style="width:96px;height:34px;padding:0 8px;border:1px solid var(--line);border-radius:6px;font-family:monospace;font-size:12.5px;font-weight:800;text-transform:uppercase;text-align:center;color:var(--ink);background:var(--paper);" />
                    <button id="btn-calc-rota" class="primary-button accent" style="height:34px;padding:0 14px;font-size:12px;font-weight:700;">
                      <i data-lucide="play"></i> <span>Traçar Rota</span>
                    </button>
                  </div>
                </div>

                <!-- Presets Rápidos de Viagem -->
                <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:11px;margin-bottom:14px;">
                  <span style="color:var(--muted);font-weight:700;">Rotas prontas:</span>
                  <button class="secondary-button preset-rota-btn" data-orig="01310-100" data-dest="04538-133" data-modal="moto" style="height:26px;padding:0 9px;font-size:11px;">Delivery: Av. Paulista → Faria Lima</button>
                  <button class="secondary-button preset-rota-btn" data-orig="01310-100" data-dest="04626-911" data-modal="carro" style="height:26px;padding:0 9px;font-size:11px;">Uber: Paulista → Aeroporto Congonhas</button>
                  <button class="secondary-button preset-rota-btn" data-orig="01310-100" data-dest="20040-002" data-modal="caminhao" style="height:26px;padding:0 9px;font-size:11px;">Via Dutra: São Paulo → Rio de Janeiro</button>
                  <button class="secondary-button preset-rota-btn" data-orig="01001-000" data-dest="11060-001" data-modal="carro" style="height:26px;padding:0 9px;font-size:11px;">Imigrantes: SP → Santos</button>
                </div>

                <!-- Controles de Simulação de Corrida Ao Vivo (60 FPS) -->
                <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--paper-elevated,#111827);border:1px solid var(--line);border-radius:var(--radius-md);margin-bottom:14px;flex-wrap:wrap;">
                  <button id="btn-toggle-anim" class="primary-button accent" style="height:32px;padding:0 12px;font-size:11.5px;font-weight:800;display:inline-flex;align-items:center;gap:6px;">
                    <i data-lucide="play"></i> <span id="anim-btn-label">Simular Viagem Ao Vivo</span>
                  </button>
                  <div style="flex:1;min-width:160px;display:flex;align-items:center;gap:8px;">
                    <span style="font-size:11px;font-weight:700;color:var(--muted);white-space:nowrap;">Progresso (<strong id="progresso-val-txt" style="color:var(--ink);">45%</strong>):</span>
                    <input type="range" id="rota-progresso-slider" min="0" max="100" value="45" style="flex:1;accent-color:#a3e635;cursor:pointer;" />
                  </div>
                  <button id="btn-download-map-svg" class="secondary-button" style="height:30px;padding:0 10px;font-size:11px;font-weight:700;">
                    <i data-lucide="download"></i> <span>Baixar SVG</span>
                  </button>
                  <button id="btn-copy-embed" class="secondary-button" style="height:30px;padding:0 10px;font-size:11px;font-weight:700;" title="Copiar código HTML <iframe> pronto">
                    <i data-lucide="copy"></i> <span>Copiar Embed</span>
                  </button>
                </div>

                <!-- Viewport do Mapa Vetorial Interativo 60 FPS (Estilo Google Maps / Uber) -->
                <div class="map-viewport-frame" id="map-viewport-frame">
                  <canvas id="ponte-map-canvas" style="display:block;width:100%;height:100%;cursor:grab;"></canvas>

                  <!-- Barra Flutuante de Busca & Camadas -->
                  <div class="map-search-overlay">
                    <div class="map-search-box" style="position:relative;">
                      <i data-lucide="search" style="color:#94a3b8;width:15px;height:15px;"></i>
                      <input type="text" id="map-quick-search" placeholder="Buscar rua, hospital, CEP, cidade..." autocomplete="off" />
                      <button id="btn-map-quick-search" class="primary-button accent" style="height:28px;padding:0 10px;font-size:11px;border-radius:8px;">Ir</button>
                      <div id="map-search-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;margin-top:6px;background:rgba(15,23,42,0.97);border:1px solid rgba(255,255,255,0.16);border-radius:10px;max-height:220px;overflow-y:auto;z-index:40;box-shadow:0 14px 30px rgba(0,0,0,0.5);"></div>
                    </div>
                    <div class="map-layers-bar">
                      <button class="map-layer-pill" id="btn-layer-stores" title="Exibir Lojas & Comércios Ativos no Mapa">
                        <i data-lucide="store" style="width:13px;height:13px;"></i> <span>Lojas Ativas</span>
                      </button>
                      <button class="map-layer-pill" id="btn-layer-style" title="Alternar Google Maps Claro / Uber Night">
                        <i data-lucide="sun" style="width:13px;height:13px;"></i> <span id="layer-style-label">Google Maps Claro</span>
                      </button>
                      <button class="map-layer-pill is-active" id="btn-layer-3d" title="Prédios em 3D Isométrico">
                        <i data-lucide="layers" style="width:13px;height:13px;"></i> <span>3D</span>
                      </button>
                      <button class="map-layer-pill is-active" id="btn-layer-traffic" title="Camada de Trânsito Ao Vivo">
                        <i data-lucide="activity" style="width:13px;height:13px;"></i> <span>Trânsito</span>
                      </button>
                      <button class="map-layer-pill" id="btn-layer-fullscreen" title="Expandir Mapa em Tela Cheia">
                        <i data-lucide="scan" style="width:13px;height:13px;"></i> <span>Tela Cheia</span>
                      </button>
                    </div>
                  </div>

                  <!-- Barra de Filtro Rápido de Lojas Ativas (Visível quando Lojas Ativas está ativo) -->
                  <div id="map-stores-filter-bar" style="display:none;position:absolute;top:96px;left:14px;z-index:20;gap:5px;flex-wrap:wrap;background:rgba(15,23,42,0.92);padding:5px 8px;border-radius:10px;border:1px solid rgba(255,255,255,0.14);backdrop-filter:blur(10px);">
                    <button class="map-layer-pill is-active store-cat-btn" data-cat="todas" style="height:26px;font-size:10.5px;">Todas</button>
                    <button class="map-layer-pill store-cat-btn" data-cat="alimentacao" style="height:26px;font-size:10.5px;color:#fb923c;">Alimentação</button>
                    <button class="map-layer-pill store-cat-btn" data-cat="varejo" style="height:26px;font-size:10.5px;color:#c084fc;">Varejo</button>
                    <button class="map-layer-pill store-cat-btn" data-cat="saude" style="height:26px;font-size:10.5px;color:#f87171;">Saúde</button>
                    <button class="map-layer-pill store-cat-btn" data-cat="servicos" style="height:26px;font-size:10.5px;color:#22d3ee;">Serviços</button>
                  </div>

                  <!-- HUD Flutuante GPS Ao Vivo (Estilo Waze / Uber Driver) -->
                  <div id="map-live-gps-hud" style="display:none;position:absolute;top:60px;left:14px;background:rgba(9,19,17,0.92);border:1px solid rgba(163,230,53,0.45);border-radius:12px;padding:9px 14px;color:#f8fafc;z-index:22;backdrop-filter:blur(10px);box-shadow:0 10px 25px rgba(0,0,0,0.45);min-width:230px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:3px;">
                      <span style="font-size:10px;font-weight:800;color:#a3e635;letter-spacing:0.6px;">NAVEGAÇÃO AO VIVO</span>
                      <span id="hud-gps-speed" style="font-size:11px;font-family:monospace;font-weight:800;color:#38bdf8;">32 km/h</span>
                    </div>
                    <div id="hud-gps-eta" style="font-size:14px;font-weight:900;color:#ffffff;">Faltam 6 min • 2.8 km</div>
                    <div id="hud-gps-street" style="font-size:10.5px;color:#cbd5e1;margin-top:2px;">Em rota pela via principal</div>
                  </div>

                  <!-- Popup Flutuante: O que há aqui? / Detalhes da Loja Ativa -->
                  <div class="map-place-popup" id="map-place-popup">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px;">
                      <strong id="popup-place-title" style="font-size:12.5px;color:#a3e635;">Local Selecionado</strong>
                      <button id="btn-close-popup" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;padding:0;"><i data-lucide="x" style="width:14px;height:14px;"></i></button>
                    </div>
                    <div id="popup-place-addr" style="font-size:11px;color:#cbd5e1;margin-bottom:6px;line-height:1.35;"></div>
                    <div id="popup-place-coords" style="font-size:10px;color:#94a3b8;font-family:monospace;margin-bottom:8px;"></div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                      <button id="btn-popup-set-orig" class="secondary-button" style="height:26px;padding:0 9px;font-size:10.5px;border-radius:6px;border-color:#a3e635;color:#a3e635;">Partir Daqui (A)</button>
                      <button id="btn-popup-set-dest" class="primary-button accent" style="height:26px;padding:0 10px;font-size:10.5px;border-radius:6px;">Ir para Cá (B)</button>
                      <button id="btn-popup-cnpj" class="secondary-button" style="display:none;height:26px;padding:0 10px;font-size:10.5px;border-radius:6px;border-color:#38bdf8;color:#38bdf8;">Consultar CNPJ</button>
                    </div>
                  </div>

                  <!-- Controles de Zoom & GPS -->
                  <div class="map-zoom-controls">
                    <button class="map-zoom-btn" id="btn-zoom-in" title="Aumentar Zoom">+</button>
                    <button class="map-zoom-btn" id="btn-zoom-out" title="Reduzir Zoom">−</button>
                    <button class="map-zoom-btn" id="btn-zoom-reset" title="Centralizar Rota" style="font-size:11px;"><i data-lucide="compass" style="width:15px;height:15px;"></i></button>
                    <button class="map-zoom-btn" id="btn-gps-me" title="Minha Localização (GPS)"><i data-lucide="map-pin" style="width:15px;height:15px;"></i></button>
                  </div>
                </div>

                <!-- Cards de Tarifa (Uber / iFood / Combustível ANP / Pix) -->
                <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(145px, 1fr));gap:10px;margin-bottom:16px;">
                  <div style="padding:12px;border-radius:var(--radius-md);background:var(--paper-elevated,#111827);border:1px solid var(--line);">
                    <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;">iFood Moto Delivery</div>
                    <div id="card-val-moto" style="font-size:17px;font-weight:900;color:#10b981;font-family:monospace;margin-top:2px;">R$ 14,90</div>
                    <div id="card-eta-moto" style="font-size:10.5px;color:var(--muted);">ETA: 11 min</div>
                  </div>
                  <div style="padding:12px;border-radius:var(--radius-md);background:var(--paper-elevated,#111827);border:1px solid var(--line);">
                    <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;">Corrida UberX</div>
                    <div id="card-val-uberx" style="font-size:17px;font-weight:900;color:#38bdf8;font-family:monospace;margin-top:2px;">R$ 21,40</div>
                    <div id="card-eta-carro" style="font-size:10.5px;color:var(--muted);">ETA: 14 min</div>
                  </div>
                  <div style="padding:12px;border-radius:var(--radius-md);background:var(--paper-elevated,#111827);border:1px solid var(--line);">
                    <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;">Combustível ANP</div>
                    <div id="card-val-combustivel" style="font-size:17px;font-weight:900;color:#f59e0b;font-family:monospace;margin-top:2px;">R$ 2,45</div>
                    <div id="card-litros-comb" style="font-size:10.5px;color:var(--muted);">0,42 L (Gasolina)</div>
                  </div>
                  <div style="padding:12px;border-radius:var(--radius-md);background:var(--paper-elevated,#111827);border:1px solid var(--line);">
                    <div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;">Pedágios na Rota</div>
                    <div id="card-val-pedagio" style="font-size:17px;font-weight:900;color:var(--ink);font-family:monospace;margin-top:2px;">R$ 0,00</div>
                    <div id="card-qtd-pedagio" style="font-size:10.5px;color:var(--muted);">0 praças</div>
                  </div>
                </div>

                <!-- Passo a Passo Turn-by-Turn & Pix Copia e Cola -->
                <div style="border:1px solid var(--line);border-radius:var(--radius-lg);overflow:hidden;background:var(--paper);">
                  <div style="padding:11px 16px;background:var(--paper-elevated,#162032);border-bottom:1px solid var(--line);font-size:12.5px;font-weight:700;color:var(--ink);display:flex;justify-content:space-between;align-items:center;">
                    <span><i data-lucide="compass"></i> Navegação Turn-by-Turn & Telemetria</span>
                    <button id="btn-copy-pix-rota" class="secondary-button" style="height:26px;padding:0 10px;font-size:10.5px;font-weight:700;color:#10b981;border-color:rgba(16,185,129,0.4);">
                      <i data-lucide="qr-code"></i> <span>Copiar Pix da Corrida</span>
                    </button>
                  </div>
                  <div id="turn-by-turn-list" style="padding:12px 16px;display:grid;gap:8px;font-size:12px;">
                    <!-- Injetado via JS -->
                  </div>
                </div>
              </div>
            </div>

            <!-- PAINEL 2: OTIMIZADOR MULTI-PARADAS (TSP) -->
            <div id="section-otimizador" class="tab-pane" style="display:none;">
              <div class="card-dashboard">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                  <span style="font-size:14px;font-weight:800;color:var(--ink);display:flex;align-items:center;gap:8px;">
                    <i data-lucide="shuffle" style="color:var(--blue);"></i>
                    <span>Otimizador de Entregas Multi-Paradas (Algoritmo TSP 2-Opt)</span>
                  </span>
                  <span class="status-badge-pill green">Economia de Rota</span>
                </div>
                <p style="font-size:12px;color:var(--muted);margin-bottom:14px;">
                  Informe o centro de distribuição (partida) e a lista de CEPs/endereços de entrega. O motor reordena as paradas para eliminar cruzamentos:
                </p>

                <div style="margin-bottom:12px;">
                  <label style="display:block;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;">CENTRO DE DISTRIBUIÇÃO / RESTAURANTE (ORIGEM)</label>
                  <input type="text" id="tsp-origem" value="01310-100" style="width:100%;height:38px;padding:0 12px;border:1px solid var(--line);border-radius:var(--radius-md);font-size:13px;font-weight:700;color:var(--ink);background:var(--paper);" />
                </div>

                <div style="margin-bottom:12px;">
                  <label style="display:block;font-size:11px;font-weight:700;color:var(--muted);margin-bottom:4px;">PARADAS DE ENTREGA (SEPARADAS POR VÍRGULA)</label>
                  <input type="text" id="tsp-paradas" value="04626-911, 01001-000, 04571-010, 05424-000, 04094-050" style="width:100%;height:38px;padding:0 12px;border:1px solid var(--line);border-radius:var(--radius-md);font-size:12.5px;font-family:monospace;color:var(--ink);background:var(--paper);" />
                </div>

                <button id="btn-exec-tsp" class="primary-button accent" style="height:38px;padding:0 18px;font-size:12.5px;font-weight:700;margin-bottom:16px;">
                  <i data-lucide="sparkles"></i> <span>Otimizar Sequência de Entregas</span>
                </button>

                <div id="tsp-metrics-box" style="padding:14px;border-radius:var(--radius-md);background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);margin-bottom:14px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;font-size:12px;">
                  <!-- Preenchido via JS -->
                </div>

                <div id="tsp-steps-list" style="display:grid;gap:8px;font-size:12px;">
                  <!-- Sequência otimizada -->
                </div>
              </div>
            </div>

            <!-- PAINEL 3: RODOVIAS & PEDÁGIOS ANTT -->
            <div id="section-pedagios" class="tab-pane" style="display:none;">
              <div class="card-dashboard">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                  <span style="font-size:14px;font-weight:800;color:var(--ink);display:flex;align-items:center;gap:8px;">
                    <i data-lucide="receipt" style="color:var(--blue);"></i>
                    <span>Calculadora de Pedágios & Frete Rodoviário ANTT</span>
                  </span>
                  <span class="status-badge-pill amber">Sem Parar / ConectCar</span>
                </div>
                <p style="font-size:12px;color:var(--muted);margin-bottom:14px;">
                  Simule viagens rodoviárias entre estados ou para o litoral/interior e veja todas as praças de pedágio detectadas no corredor:
                </p>

                <div style="display:grid;grid-template-columns:1fr 1fr 110px;gap:10px;margin-bottom:12px;">
                  <input type="text" id="ped-origem" value="São Paulo - SP" placeholder="Origem..." style="height:38px;padding:0 10px;border:1px solid var(--line);border-radius:var(--radius-md);font-size:12.5px;font-weight:700;color:var(--ink);background:var(--paper);" />
                  <input type="text" id="ped-destino" value="Rio de Janeiro - RJ" placeholder="Destino..." style="height:38px;padding:0 10px;border:1px solid var(--line);border-radius:var(--radius-md);font-size:12.5px;font-weight:700;color:var(--ink);background:var(--paper);" />
                  <select id="ped-eixos" style="height:38px;padding:0 8px;border:1px solid var(--line);border-radius:var(--radius-md);font-size:12px;font-weight:700;color:var(--ink);background:var(--paper);">
                    <option value="2">Passeio (2 eixos)</option>
                    <option value="3">Caminhão 3 eixos</option>
                    <option value="4">Carreta 4 eixos</option>
                    <option value="6" selected>Carreta 6 eixos</option>
                    <option value="9">Bitrem 9 eixos</option>
                  </select>
                </div>

                <button id="btn-exec-pedagios" class="primary-button accent" style="height:38px;padding:0 16px;font-size:12.5px;font-weight:700;margin-bottom:16px;">
                  <i data-lucide="play"></i> <span>Calcular Pedágios e Piso ANTT</span>
                </button>

                <div id="pedagios-result-list" style="display:grid;gap:8px;font-size:12px;">
                  <!-- Lista de praças -->
                </div>
              </div>
            </div>

            <!-- PAINEL 4: GEOCODIFICAÇÃO & CEP REVERSO -->
            <div id="section-geocoding" class="tab-pane" style="display:none;">
              <div class="card-dashboard">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                  <span style="font-size:14px;font-weight:800;color:var(--ink);display:flex;align-items:center;gap:8px;">
                    <i data-lucide="map-pin" style="color:var(--blue);"></i>
                    <span>Geocodificação Direta & CEP Reverso (GPS → Endereço)</span>
                  </span>
                  <span class="status-badge-pill blue">5.570 Municípios IBGE</span>
                </div>
                <p style="font-size:12px;color:var(--muted);margin-bottom:14px;">
                  Converta coordenadas de GPS do celular do entregador no endereço, CEP, DDD e código IBGE mais próximo:
                </p>

                <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
                  <input type="text" id="geo-input" value="-23.5614, -46.6558" placeholder="Ex: -23.5614, -46.6558 ou 01310-100 ou Curitiba - PR" style="flex:1;min-width:200px;height:40px;padding:0 12px;border:1px solid var(--line);border-radius:var(--radius-md);font-family:monospace;font-size:13px;font-weight:700;color:var(--ink);background:var(--paper);" />
                  <button id="btn-exec-geo" class="primary-button accent" style="height:40px;padding:0 16px;font-size:12.5px;font-weight:700;">
                    <i data-lucide="search"></i> <span>Geocodificar</span>
                  </button>
                </div>

                <table class="specs-table" id="geo-table-result">
                  <tbody>
                    <tr><td class="label-col">Endereço / Local</td><td class="val-col" id="geo-res-end">Avenida Paulista, 1578 — Bela Vista, São Paulo/SP</td></tr>
                    <tr><td class="label-col">Coordenadas GPS</td><td class="val-col" id="geo-res-coords" style="font-family:monospace;">-23.5614, -46.6558</td></tr>
                    <tr><td class="label-col">CEP Estimado</td><td class="val-col" id="geo-res-cep" style="font-family:monospace;">01310-100</td></tr>
                    <tr><td class="label-col">Município / UF / IBGE</td><td class="val-col" id="geo-res-ibge">São Paulo / SP (3550308)</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <!-- Coluna Direita: Terminal Dark Console -->
          <div class="playground-right">
            <div class="terminal-window" style="margin-bottom:18px;">
              <div class="terminal-topbar">
                <div class="terminal-dots">
                  <div class="terminal-dot red"></div>
                  <div class="terminal-dot yellow"></div>
                  <div class="terminal-dot green"></div>
                </div>
                <div style="display:flex;gap:4px;">
                  <button class="secondary-button snippet-tab is-active" data-lang="curl" style="height:24px;padding:0 8px;font-size:10.5px;">cURL</button>
                  <button class="secondary-button snippet-tab" data-lang="nodejs" style="height:24px;padding:0 8px;font-size:10.5px;">Node.js</button>
                  <button class="secondary-button snippet-tab" data-lang="python" style="height:24px;padding:0 8px;font-size:10.5px;">Python</button>
                </div>
                <button id="btn-copy-code" class="icon-button" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;" title="Copiar Snippet">
                  <i data-lucide="copy"></i>
                </button>
              </div>
              <div style="padding:7px 14px;background:rgba(255,255,255,0.02);border-bottom:1px solid rgba(255,255,255,0.06);font-size:11px;color:#94a3b8;font-family:monospace;">
                GET <span id="endpoint-display" style="color:#a3e635;">/api/rotas/calcular?origem=01310-100&destino=04538-133</span>
              </div>
              <pre id="snippet-code" style="margin:0;padding:12px 14px;font-family:monospace;font-size:11px;color:#e2e8f0;line-height:1.5;overflow-x:auto;"></pre>
            </div>

            <div class="terminal-window">
              <div class="terminal-topbar">
                <div class="terminal-dots">
                  <div class="terminal-dot red"></div>
                  <div class="terminal-dot yellow"></div>
                  <div class="terminal-dot green"></div>
                </div>
                <div style="font-size:11px;font-weight:700;color:#94a3b8;font-family:monospace;">
                  TELEMETRIA JSON ANYCAST (&lt;2MS)
                </div>
                <button id="btn-copy-json" class="icon-button" style="background:transparent;border:none;color:#94a3b8;cursor:pointer;" title="Copiar JSON">
                  <i data-lucide="copy"></i>
                </button>
              </div>
              <div style="min-height:320px;max-height:560px;overflow-y:auto;padding:14px;background:#091311;">
                <div style="display:flex;justify-content:space-between;margin-bottom:10px;font-size:10.5px;color:#94a3b8;font-family:monospace;border-bottom:1px solid rgba(255,255,255,0.06);padding-bottom:6px;">
                  <span id="console-status" class="status-badge-pill green" style="padding:2px 8px;font-size:10px;">200 OK</span>
                  <span id="console-latency">Latência: 1.1ms</span>
                  <span>Cloudflare Edge</span>
                </div>
                <pre id="console-output" style="margin:0;font-family:monospace;font-size:11px;color:#f8fafc;line-height:1.5;"></pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>

  <!-- Toast Flutuante -->
  <div id="ponte-toast" style="position:fixed;bottom:24px;right:24px;z-index:9999;padding:10px 18px;border-radius:10px;background:rgba(15,23,42,0.95);border:1px solid rgba(163,230,53,0.4);color:#fff;font-size:12.5px;font-weight:700;display:flex;align-items:center;gap:8px;transform:translateY(100px);opacity:0;transition:all 0.25s ease;pointer-events:none;">
    <i data-lucide="check-circle-2" style="color:#a3e635;"></i>
    <span id="toast-msg">Copiado!</span>
  </div>

  <!-- Barra de Navegação Inferior Mobile -->
  <nav class="mobile-bottom-nav" id="mobile-bottom-nav" aria-label="Navegação mobile">
    <button class="mobile-nav-item is-active" data-tab="tracking">
      <i data-lucide="compass"></i><span>Tracking</span>
    </button>
    <button class="mobile-nav-item" data-tab="otimizador">
      <i data-lucide="shuffle"></i><span>Multi-Stop</span>
    </button>
    <button class="mobile-nav-item" data-tab="pedagios">
      <i data-lucide="receipt"></i><span>Pedágios</span>
    </button>
    <button class="mobile-nav-item" data-tab="geocoding">
      <i data-lucide="map-pin"></i><span>CEP Reverso</span>
    </button>
  </nav>

  <script type="module">
    import { PonteMapEngine } from './ponte-maps-engine.js?v=3.0.0';

    const API_BASE = window.location.hostname.includes('workers.dev') ? '' : 'https://rotas-pro-api.clepta2.workers.dev';
    let currentModal = 'carro';
    let currentLang = 'curl';
    let animFrameId = null;
    let lastPixPayload = '';
    let lastClickedCoords = null;

    // Inicializa o Motor Cartográfico 60 FPS
    const mapCanvas = document.getElementById('ponte-map-canvas');
    const initialTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const mapEngine = window._mapEngine = new PonteMapEngine(mapCanvas, {
      apiBase: API_BASE,
      theme: initialTheme,
      lat: -23.5740,
      lng: -46.6690,
      zoom: 14.0,
      onMapClick: async (coords) => {
        mapEngine.setCustomPin(coords);
        lastClickedCoords = coords;
        document.getElementById('btn-popup-cnpj').style.display = 'none';
        const popup = document.getElementById('map-place-popup');
        popup.style.display = 'block';
        document.getElementById('popup-place-title').textContent = 'Consultando CEP Reverso...';
        document.getElementById('popup-place-addr').textContent = '';
        document.getElementById('popup-place-coords').textContent = coords.lat.toFixed(5) + ', ' + coords.lng.toFixed(5);
        try {
          const r = await fetch(API_BASE + '/api/rotas/geocoding/reverso?lat=' + coords.lat + '&lng=' + coords.lng);
          const d = await r.json();
          if (d.valido) {
            document.getElementById('popup-place-title').textContent = d.municipio + ' / ' + d.uf + ' • CEP ' + d.cepEstimado;
            document.getElementById('popup-place-addr').textContent = d.enderecoFormatado;
          }
        } catch (_) {}
      },
      onStoreClick: (store) => {
        mapEngine.setCustomPin({ lat: store.lat, lng: store.lng });
        lastClickedCoords = { lat: store.lat, lng: store.lng };
        window._selectedStoreName = store.nome;
        window._selectedStoreCnpj = store.cnpj || null;
        const popup = document.getElementById('map-place-popup');
        popup.style.display = 'block';
        document.getElementById('popup-place-title').textContent = store.nome + ' • ATIVA' + (store.cnpj ? ' (CNPJ ' + store.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') + ')' : '');
        const extra = [
          store.categoria.toUpperCase() + ' (' + store.subcategoria + ')',
          store.endereco ? store.endereco + (store.cep ? ' — CEP ' + store.cep : '') : '',
          store.telefone ? 'Tel: ' + store.telefone : '',
          store.distanciaMetros + 'm de distância (' + store.cidade + ')'
        ].filter(Boolean).join(' • ');
        document.getElementById('popup-place-addr').textContent = extra;
        document.getElementById('popup-place-coords').textContent = store.lat.toFixed(5) + ', ' + store.lng.toFixed(5);
        document.getElementById('btn-popup-cnpj').style.display = 'inline-flex';
      },
      onMoveEnd: () => {
        if (document.getElementById('btn-layer-stores')?.classList.contains('is-active')) {
          carregarLojasAtivasNoMapa();
        }
      }
    });

    // Camada Interativa de Lojas & Comércios Ativos
    let activeStoreCategory = 'todas';
    async function carregarLojasAtivasNoMapa() {
      const btn = document.getElementById('btn-layer-stores');
      if (!btn || !btn.classList.contains('is-active')) return;
      const t0 = performance.now();
      try {
        const q = '?lat=' + mapEngine.lat + '&lng=' + mapEngine.lng + '&raioKm=2.5&categoria=' + activeStoreCategory + '&limite=150';
        const r = await fetch(API_BASE + '/api/rotas/lojas' + q);
        const d = await r.json();
        if (d.valido) {
          mapEngine.setStores(d.lojas, true);
          renderJson(d, Math.max(1, Math.round(performance.now() - t0)));
          showToast(d.exibindo + ' lojas ativas carregadas na região!');
        }
      } catch (_) {}
    }

    document.getElementById('btn-layer-stores')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      btn.classList.toggle('is-active');
      const isActive = btn.classList.contains('is-active');
      document.getElementById('map-stores-filter-bar').style.display = isActive ? 'flex' : 'none';
      if (isActive) {
        carregarLojasAtivasNoMapa();
      } else {
        mapEngine.setStores([], false);
      }
    });

    document.querySelectorAll('.store-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.store-cat-btn').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        activeStoreCategory = btn.dataset.cat || 'todas';
        carregarLojasAtivasNoMapa();
      });
    });

    document.getElementById('btn-popup-cnpj')?.addEventListener('click', async () => {
      const nome = window._selectedStoreName;
      const cnpj = window._selectedStoreCnpj;
      if (!nome && !cnpj) return;
      showToast('Consultando Receita Federal via CNPJ Pro...');
      const t0 = performance.now();
      try {
        const endpoint = cnpj
          ? 'https://cnpj-pro-api.maputo3.workers.dev/api/cnpj/' + cnpj
          : 'https://cnpj-pro-api.maputo3.workers.dev/api/cnpj/busca?q=' + encodeURIComponent(nome);
        const r = await fetch(endpoint);
        const d = await r.json();
        renderJson(d, Math.max(1, Math.round(performance.now() - t0)));
      } catch (err) {
        renderJson({ erro: 'FALHA_CONSULTA_CNPJ', mensagem: err.message }, 0);
      }
    });

    function showToast(msg) {
      const t = document.getElementById('ponte-toast');
      document.getElementById('toast-msg').textContent = msg;
      t.style.transform = 'translateY(0)';
      t.style.opacity = '1';
      clearTimeout(window._tt);
      window._tt = setTimeout(() => {
        t.style.transform = 'translateY(100px)';
        t.style.opacity = '0';
      }, 2300);
    }

    function renderLucide() {
      if (window.lucide) window.lucide.createIcons();
    }

    // Drawer & Abas
    const sidebarEl = document.querySelector('.sidebar');
    const backdropEl = document.getElementById('sidebar-drawer-backdrop');
    document.getElementById('mobile-hamburger-btn')?.addEventListener('click', () => {
      sidebarEl?.classList.add('is-open');
      if (backdropEl) backdropEl.hidden = false;
    });
    const closeDrawer = () => {
      sidebarEl?.classList.remove('is-open');
      if (backdropEl) backdropEl.hidden = true;
    };
    document.getElementById('sidebar-drawer-close')?.addEventListener('click', closeDrawer);
    backdropEl?.addEventListener('click', closeDrawer);

    document.querySelectorAll('.tab-nav-btn, .primary-nav .nav-link[data-view], .mobile-bottom-nav .mobile-nav-item[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.tab || btn.dataset.view;
        if (!key) return;
        document.querySelectorAll('.tab-nav-btn').forEach(b => b.classList.toggle('is-active', b.dataset.tab === key));
        document.querySelectorAll('.primary-nav .nav-link[data-view]').forEach(b => b.classList.toggle('is-active', b.dataset.view === key));
        document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item[data-tab]').forEach(b => b.classList.toggle('is-active', b.dataset.tab === key));
        document.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
        const target = document.getElementById('section-' + key);
        if (target) target.style.display = 'block';
        closeDrawer();
        updateSnippet();
        if (key === 'otimizador') executarTsp();
        else if (key === 'pedagios') executarPedagios();
        else if (key === 'geocoding') executarGeocoding();
      });
    });

    // Tema Global e Estilo do Mapa
    const layerStyleBtn = document.getElementById('btn-layer-style');
    const layerStyleLabel = document.getElementById('layer-style-label');
    function syncMapStyleLabel(theme) {
      if (layerStyleLabel) layerStyleLabel.textContent = theme === 'dark' ? 'Google Maps Claro' : 'Uber Night Escuro';
    }
    syncMapStyleLabel(initialTheme);

    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ponte.theme', next);
      mapEngine.setTheme(next);
      syncMapStyleLabel(next);
    });

    layerStyleBtn?.addEventListener('click', () => {
      const next = mapEngine.theme === 'dark' ? 'light' : 'dark';
      mapEngine.setTheme(next);
      syncMapStyleLabel(next);
    });

    document.getElementById('btn-layer-3d')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      btn.classList.toggle('is-active');
      mapEngine.set3D(btn.classList.contains('is-active'));
    });

    document.getElementById('btn-layer-traffic')?.addEventListener('click', (e) => {
      const btn = e.currentTarget;
      btn.classList.toggle('is-active');
      mapEngine.setTraffic(btn.classList.contains('is-active'));
    });

    document.getElementById('btn-layer-fullscreen')?.addEventListener('click', (e) => {
      const frame = document.getElementById('map-viewport-frame');
      frame.classList.toggle('is-fullscreen');
      e.currentTarget.classList.toggle('is-active');
      setTimeout(() => mapEngine._resize(), 60);
    });

    // Busca Rápida dentro do Mapa (flyTo suave)
    async function executarBuscaMapa() {
      const q = document.getElementById('map-quick-search').value.trim();
      if (!q) return;
      const res = await fetch(API_BASE + '/api/rotas/geocoding?q=' + encodeURIComponent(q));
      const d = await res.json();
      if (d.valido) {
        mapEngine.flyTo(d.lat, d.lng, 14.8, 700);
        mapEngine.setCustomPin({ lat: d.lat, lng: d.lng });
        lastClickedCoords = { lat: d.lat, lng: d.lng };
        const popup = document.getElementById('map-place-popup');
        popup.style.display = 'block';
        document.getElementById('popup-place-title').textContent = (d.cidade || '') + '/' + (d.uf || '') + ' • ' + (d.cep || '');
        document.getElementById('popup-place-addr').textContent = d.rotulo;
        document.getElementById('popup-place-coords').textContent = d.lat.toFixed(5) + ', ' + d.lng.toFixed(5);
      } else {
        showToast('Local não encontrado!');
      }
    }
    document.getElementById('btn-map-quick-search')?.addEventListener('click', executarBuscaMapa);
    const searchInputEl = document.getElementById('map-quick-search');
    const searchDropEl = document.getElementById('map-search-dropdown');
    let searchDebounce = null;
    searchInputEl?.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      const q = searchInputEl.value.trim();
      if (q.length < 2) {
        if (searchDropEl) searchDropEl.style.display = 'none';
        return;
      }
      searchDebounce = setTimeout(async () => {
        try {
          const r = await fetch(API_BASE + '/api/rotas/buscar?q=' + encodeURIComponent(q));
          const d = await r.json();
          if (d.resultados && d.resultados.length > 0 && searchDropEl) {
            searchDropEl.innerHTML = d.resultados.map(item =>
              '<div class="map-ac-item" data-lat="' + item.lat + '" data-lng="' + item.lng + '" data-name="' + item.n.replace(/"/g, '&quot;') + '" data-city="' + (item.c || '') + '" style="padding:8px 12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#f8fafc;">' +
                '<span><strong>' + item.n + '</strong></span>' +
                '<span style="font-size:10px;color:#94a3b8;">' + (item.c || '') + ' (' + item.t + ')</span>' +
              '</div>'
            ).join('');
            searchDropEl.style.display = 'block';
            searchDropEl.querySelectorAll('.map-ac-item').forEach(row => {
              row.addEventListener('click', () => {
                const lat = Number(row.dataset.lat);
                const lng = Number(row.dataset.lng);
                searchInputEl.value = row.dataset.name;
                searchDropEl.style.display = 'none';
                mapEngine.flyTo(lat, lng, 15.2, 700);
                mapEngine.setCustomPin({ lat, lng });
                lastClickedCoords = { lat, lng };
                const popup = document.getElementById('map-place-popup');
                popup.style.display = 'block';
                document.getElementById('popup-place-title').textContent = row.dataset.name;
                document.getElementById('popup-place-addr').textContent = row.dataset.city;
                document.getElementById('popup-place-coords').textContent = lat.toFixed(5) + ', ' + lng.toFixed(5);
              });
            });
          } else if (searchDropEl) {
            searchDropEl.style.display = 'none';
          }
        } catch (_) {}
      }, 220);
    });
    searchInputEl?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        if (searchDropEl) searchDropEl.style.display = 'none';
        executarBuscaMapa();
      }
    });

    document.getElementById('btn-close-popup')?.addEventListener('click', () => {
      document.getElementById('map-place-popup').style.display = 'none';
      mapEngine.setCustomPin(null);
    });
    document.getElementById('btn-popup-set-orig')?.addEventListener('click', () => {
      if (!lastClickedCoords) return;
      document.getElementById('rota-origem').value = lastClickedCoords.lat.toFixed(5) + ', ' + lastClickedCoords.lng.toFixed(5);
      document.getElementById('map-place-popup').style.display = 'none';
      executarTrackingMapa();
    });
    document.getElementById('btn-popup-set-dest')?.addEventListener('click', () => {
      if (!lastClickedCoords) return;
      document.getElementById('rota-destino').value = lastClickedCoords.lat.toFixed(5) + ', ' + lastClickedCoords.lng.toFixed(5);
      document.getElementById('map-place-popup').style.display = 'none';
      executarTrackingMapa();
    });
    document.getElementById('btn-swap-routes')?.addEventListener('click', () => {
      const o = document.getElementById('rota-origem');
      const d = document.getElementById('rota-destino');
      const tmp = o.value;
      o.value = d.value;
      d.value = tmp;
      executarTrackingMapa();
    });
    document.getElementById('btn-copy-embed')?.addEventListener('click', () => {
      const orig = encodeURIComponent(document.getElementById('rota-origem').value || '01310-100');
      const dest = encodeURIComponent(document.getElementById('rota-destino').value || '04538-133');
      const iframeCode = '<iframe src="https://rotas-pro-api.clepta2.workers.dev/embed?origem=' + orig + '&destino=' + dest + '&tema=' + mapEngine.theme + '" width="100%" height="480" style="border:0;border-radius:14px;" loading="lazy"></iframe>';
      navigator.clipboard.writeText(iframeCode).then(() => showToast('Código Embed <iframe> copiado!'));
    });

    // Controles de Zoom & GPS do Mapa
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
      mapEngine.flyTo(mapEngine.lat, mapEngine.lng, Math.min(18.5, mapEngine.zoom + 1.0), 250);
    });
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
      mapEngine.flyTo(mapEngine.lat, mapEngine.lng, Math.max(4.0, mapEngine.zoom - 1.0), 250);
    });
    document.getElementById('btn-zoom-reset')?.addEventListener('click', () => {
      if (mapEngine.routeData) mapEngine.setRoute(mapEngine.routeData, true);
      else mapEngine.flyTo(-14.235, -51.925, 4.5, 600);
    });
    document.getElementById('btn-gps-me')?.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showToast('Geolocalização não suportada neste navegador.');
        return;
      }
      navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude, longitude } = pos.coords;
        mapEngine.flyTo(latitude, longitude, 15.2, 700);
        mapEngine.setCustomPin({ lat: latitude, lng: longitude });
        showToast('Centralizado na sua localização GPS!');
      }, () => {
        showToast('Permissão de GPS negada — centralizado em São Paulo.');
        mapEngine.flyTo(-23.5614, -46.6558, 14.5, 700);
      });
    });

    function getActiveTab() {
      return document.querySelector('.tab-nav-btn.is-active')?.dataset.tab || 'tracking';
    }

    function updateSnippet() {
      const tab = getActiveTab();
      const orig = encodeURIComponent(document.getElementById('rota-origem')?.value || '01310-100');
      const dest = encodeURIComponent(document.getElementById('rota-destino')?.value || '04538-133');
      const placa = encodeURIComponent(document.getElementById('rota-placa')?.value || 'BRA2E19');
      const prog = document.getElementById('rota-progresso-slider')?.value || '45';

      let ep = '/api/rotas/tracking?origem=' + orig + '&destino=' + dest + '&modal=' + currentModal + '&progresso=' + prog + '&placa=' + placa;
      if (tab === 'otimizador') ep = '/api/rotas/otimizar?origem=01310-100&paradas=04626-911,01001-000,04571-010';
      else if (tab === 'pedagios') ep = '/api/rotas/calcular?origem=Sao+Paulo-SP&destino=Rio+de+Janeiro-RJ&modal=caminhao&eixos=6';
      else if (tab === 'geocoding') ep = '/api/rotas/geocoding/reverso?lat=-23.5614&lng=-46.6558';

      document.getElementById('endpoint-display').textContent = ep;
      const full = 'https://rotas-pro-api.clepta2.workers.dev' + ep;
      const codeEl = document.getElementById('snippet-code');

      if (currentLang === 'curl') {
        codeEl.textContent = 'curl -s "' + full + '" \\\\\\\\n  -H "x-api-key: rot_live_anycast_2026"';
      } else if (currentLang === 'nodejs') {
        codeEl.textContent = 'const res = await fetch("' + full + '");\\nconst data = await res.json();\\nconsole.log(data);';
      } else {
        codeEl.textContent = 'import requests\\nres = requests.get("' + full + '")\\nprint(res.json())';
      }
    }

    document.querySelectorAll('.snippet-tab').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.snippet-tab').forEach(x => x.classList.remove('is-active'));
        b.classList.add('is-active');
        currentLang = b.dataset.lang;
        updateSnippet();
      });
    });

    function renderJson(data, latMs) {
      document.getElementById('console-latency').textContent = 'Latência: ' + latMs + 'ms';
      document.getElementById('console-output').textContent = JSON.stringify(data, null, 2);
    }

    // Executar Rota e Atualizar Motor Cartográfico 60 FPS
    async function executarTrackingMapa() {
      const orig = document.getElementById('rota-origem').value || '01310-100';
      const dest = document.getElementById('rota-destino').value || '04538-133';
      const placa = document.getElementById('rota-placa').value || 'BRA2E19';
      const prog = document.getElementById('rota-progresso-slider').value || '45';
      updateSnippet();

      const t0 = performance.now();
      try {
        const q = '?origem=' + encodeURIComponent(orig) + '&destino=' + encodeURIComponent(dest) + '&modal=' + currentModal + '&placa=' + encodeURIComponent(placa) + '&progresso=' + prog;
        const resJson = await fetch(API_BASE + '/api/rotas/tracking' + q);
        const data = await resJson.json();
        const lat = Math.max(1, Math.round(performance.now() - t0));

        renderJson(data, lat);

        if (data.valido && data.rotaBase) {
          const r = data.rotaBase;
          mapEngine.setRoute(r, true);
          mapEngine.setVehicleProgress(Number(prog));

          document.getElementById('live-status-pill').textContent = data.statusFase.replace(/_/g, ' ');
          document.getElementById('card-val-moto').textContent = r.cotacoesCorridaEFrete.modalidades.motoDeliveryIfood.formatado;
          document.getElementById('card-eta-moto').textContent = 'ETA: ' + r.comparativoModais.motoDelivery.tempoMin + ' min';
          document.getElementById('card-val-uberx').textContent = r.cotacoesCorridaEFrete.modalidades.uberX.formatado;
          document.getElementById('card-eta-carro').textContent = 'ETA: ' + r.comparativoModais.carroApp.tempoMin + ' min';
          document.getElementById('card-val-combustivel').textContent = 'R$ ' + r.custosCombustivelAnp.gastoEstimadoGasolina.toFixed(2).replace('.', ',');
          document.getElementById('card-litros-comb').textContent = r.custosCombustivelAnp.litrosEstimados + ' L (ANP ' + r.custosCombustivelAnp.ufReferencia + ')';
          document.getElementById('card-val-pedagio').textContent = r.pedagios.custoTotalFormatado;
          document.getElementById('card-qtd-pedagio').textContent = r.pedagios.quantidadePracas + ' praça(s)';
          lastPixPayload = r.pagamentoPixIntegrado?.pixCopiaECola || '';

          const stepsHtml = (r.passoAPassoTurnByTurn || []).map(s =>
            '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-radius:6px;background:var(--paper-elevated,#111827);border:1px solid var(--line);">' +
              '<span><strong>' + s.ordem + '.</strong> ' + s.instrucao + '</span>' +
              '<span class="status-badge-pill blue" style="font-size:10.5px;">' + s.distanciaTrechoKm + ' km • ' + s.tempoTrechoMin + ' min</span>' +
            '</div>'
          ).join('');
          document.getElementById('turn-by-turn-list').innerHTML = stepsHtml;
        }
      } catch (e) {
        console.error(e);
      }
    }

    document.getElementById('btn-calc-rota')?.addEventListener('click', executarTrackingMapa);
    document.getElementById('rota-progresso-slider')?.addEventListener('input', (e) => {
      const val = Number(e.target.value);
      document.getElementById('progresso-val-txt').textContent = val + '%';
      mapEngine.setVehicleProgress(val);
    });

    document.querySelectorAll('.modal-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-chip').forEach(b => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        currentModal = btn.dataset.modal;
        executarTrackingMapa();
      });
    });

    document.querySelectorAll('.preset-rota-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('rota-origem').value = btn.dataset.orig;
        document.getElementById('rota-destino').value = btn.dataset.dest;
        currentModal = btn.dataset.modal || 'carro';
        document.querySelectorAll('.modal-chip').forEach(b => b.classList.toggle('is-active', b.dataset.modal === currentModal));
        executarTrackingMapa();
      });
    });

    // Animação Contínua 60 FPS da Viagem Ao Vivo + HUD GPS
    document.getElementById('btn-toggle-anim')?.addEventListener('click', () => {
      const label = document.getElementById('anim-btn-label');
      const slider = document.getElementById('rota-progresso-slider');
      const hud = document.getElementById('map-live-gps-hud');
      if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
        label.textContent = 'Simular Viagem Ao Vivo';
        if (hud) hud.style.display = 'none';
        return;
      }
      label.textContent = 'Pausar Simulação';
      if (hud) hud.style.display = 'block';
      let p = parseFloat(slider.value);
      if (p >= 100) p = 0;
      let lastTs = performance.now();

      const updateHud = (pct) => {
        const r = mapEngine.routeData;
        if (!r || !hud) return;
        const totKm = r.resumoViagem?.distanciaViariaKm || 5;
        const totMin = r.resumoViagem?.tempoEstimadoMin || 12;
        const restKm = Math.max(0, totKm * (1 - pct / 100)).toFixed(1);
        const restMin = Math.max(0, Math.ceil(totMin * (1 - pct / 100)));
        document.getElementById('hud-gps-eta').textContent = pct >= 100 ? 'Chegou ao destino!' : ('Faltam ' + restMin + ' min • ' + restKm + ' km');
        document.getElementById('hud-gps-speed').textContent = pct >= 100 ? '0 km/h' : ((r.resumoViagem?.velocidadeMediaKmh || 32) + ' km/h');
        const vias = r.viasPrincipaisNaRota || [];
        if (vias.length > 0) {
          const viaIdx = Math.min(vias.length - 1, Math.floor((pct / 100) * vias.length));
          document.getElementById('hud-gps-street').textContent = 'Via atual: ' + vias[viaIdx];
        }
      };

      const stepAnim = (now) => {
        const dt = (now - lastTs) / 1000;
        lastTs = now;
        p += dt * 7.5;
        if (p >= 100) {
          p = 100;
          slider.value = '100';
          document.getElementById('progresso-val-txt').textContent = '100%';
          mapEngine.setVehicleProgress(100);
          updateHud(100);
          animFrameId = null;
          label.textContent = 'Simular Viagem Ao Vivo';
          document.getElementById('live-status-pill').textContent = 'VIAGEM CONCLUÍDA';
          return;
        }
        slider.value = String(Math.round(p));
        document.getElementById('progresso-val-txt').textContent = Math.round(p) + '%';
        mapEngine.setVehicleProgress(p);
        updateHud(p);
        animFrameId = requestAnimationFrame(stepAnim);
      };
      animFrameId = requestAnimationFrame(stepAnim);
    });

    // Copiar Pix e Baixar SVG Vetorial da Rota
    document.getElementById('btn-copy-pix-rota')?.addEventListener('click', () => {
      if (lastPixPayload) {
        navigator.clipboard.writeText(lastPixPayload).then(() => showToast('Pix Copia e Cola da corrida copiado!'));
      }
    });
    document.getElementById('btn-download-map-svg')?.addEventListener('click', async () => {
      const orig = document.getElementById('rota-origem').value || '01310-100';
      const dest = document.getElementById('rota-destino').value || '04538-133';
      const placa = document.getElementById('rota-placa').value || 'BRA2E19';
      const prog = document.getElementById('rota-progresso-slider').value || '45';
      const q = '?origem=' + encodeURIComponent(orig) + '&destino=' + encodeURIComponent(dest) + '&modal=' + currentModal + '&placa=' + encodeURIComponent(placa) + '&progresso=' + prog + '&tema=' + mapEngine.theme;
      const res = await fetch(API_BASE + '/api/rotas/mapa.svg' + q);
      const svg = await res.text();
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mapa-rota-anycast.svg';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Download do Mapa Vetorial SVG iniciado!');
    });

    // 2. Otimizador TSP
    async function executarTsp() {
      const orig = document.getElementById('tsp-origem').value || '01310-100';
      const paradas = (document.getElementById('tsp-paradas').value || '').split(',').map(s => s.trim()).filter(Boolean);
      const t0 = performance.now();
      const res = await fetch(API_BASE + '/api/rotas/otimizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origem: orig, paradas, retornarOrigem: true, modal: 'moto' })
      });
      const data = await res.json();
      renderJson(data, Math.max(1, Math.round(performance.now() - t0)));
      if (data.valido) {
        const m = data.metricasOtimizacao;
        document.getElementById('tsp-metrics-box').innerHTML =
          '<div>Distância Sem Otimizar: <strong>' + m.distanciaOrdemOriginalKm + ' km</strong></div>' +
          '<div>Distância Otimizada (2-Opt): <strong style="color:#10b981;">' + m.distanciaOtimizadaKm + ' km</strong></div>' +
          '<div>Economia Gerada: <strong style="color:#a3e635;">' + m.economiaDistanciaKm + ' km (' + m.economiaPercentual + ')</strong></div>' +
          '<div>Tempo Total: <strong>' + m.tempoTotalEstimadoMin + ' min</strong></div>';

        document.getElementById('tsp-steps-list').innerHTML = data.sequenciaOtimizada.map(s =>
          '<div style="padding:10px 12px;border-radius:8px;background:var(--paper-elevated,#111827);border:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;">' +
            '<span><strong style="color:#a3e635;">' + s.ordemEntrega + 'ª Entrega:</strong> ' + s.rotulo + '</span>' +
            '<span class="status-badge-pill green">Parada #' + s.indiceOriginal + '</span>' +
          '</div>'
        ).join('');
      }
    }
    document.getElementById('btn-exec-tsp')?.addEventListener('click', executarTsp);

    // 3. Pedágios ANTT
    async function executarPedagios() {
      const orig = document.getElementById('ped-origem').value || 'São Paulo - SP';
      const dest = document.getElementById('ped-destino').value || 'Rio de Janeiro - RJ';
      const eixos = document.getElementById('ped-eixos').value || '6';
      const t0 = performance.now();
      const res = await fetch(API_BASE + '/api/rotas/calcular?origem=' + encodeURIComponent(orig) + '&destino=' + encodeURIComponent(dest) + '&modal=caminhao&eixos=' + eixos);
      const data = await res.json();
      renderJson(data, Math.max(1, Math.round(performance.now() - t0)));
      if (data.valido) {
        const pracas = data.pedagios.pracas || [];
        document.getElementById('pedagios-result-list').innerHTML =
          '<div style="padding:12px;border-radius:8px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);display:flex;justify-content:space-between;">' +
            '<span>Frete Mínimo ANTT (' + eixos + ' eixos): <strong>' + data.cotacoesCorridaEFrete.modalidades.freteRodoviarioAntt.formatado + '</strong></span>' +
            '<span>Total Pedágios: <strong style="color:#f59e0b;">' + data.pedagios.custoTotalFormatado + ' (' + data.pedagios.quantidadePracas + ' praças)</strong></span>' +
          '</div>' +
          pracas.map(p =>
            '<div style="padding:10px 12px;border-radius:8px;background:var(--paper-elevated,#111827);border:1px solid var(--line);display:flex;justify-content:space-between;">' +
              '<span><strong>' + p.nome + '</strong> (' + p.rodovia + ')</span>' +
              '<strong style="color:#f59e0b;font-family:monospace;">' + p.tarifaFormatada + '</strong>' +
            '</div>'
          ).join('');
      }
    }
    document.getElementById('btn-exec-pedagios')?.addEventListener('click', executarPedagios);

    // 4. Geocoding & CEP Reverso
    async function executarGeocoding() {
      const val = document.getElementById('geo-input').value.trim();
      const t0 = performance.now();
      const res = await fetch(API_BASE + '/api/rotas/geocoding?q=' + encodeURIComponent(val));
      const data = await res.json();
      renderJson(data, Math.max(1, Math.round(performance.now() - t0)));
      if (data.valido) {
        document.getElementById('geo-res-end').textContent = data.rotulo || data.enderecoFormatado;
        document.getElementById('geo-res-coords').textContent = (data.lat ?? data.latitude) + ', ' + (data.lng ?? data.longitude);
        document.getElementById('geo-res-cep').textContent = data.cep || data.cepEstimado || '-';
        document.getElementById('geo-res-ibge').textContent = (data.cidade || data.municipio) + ' / ' + data.uf + ' (' + data.codigoIbge + ')';
      }
    }
    document.getElementById('btn-exec-geo')?.addEventListener('click', executarGeocoding);

    document.getElementById('btn-copy-code')?.addEventListener('click', () => {
      navigator.clipboard.writeText(document.getElementById('snippet-code').textContent).then(() => showToast('Snippet copiado!'));
    });
    document.getElementById('btn-copy-json')?.addEventListener('click', () => {
      navigator.clipboard.writeText(document.getElementById('console-output').textContent).then(() => showToast('JSON copiado!'));
    });

    renderLucide();
    setTimeout(executarTrackingMapa, 80);
  </script>
</body>
</html>`;

fs.writeFileSync('index.html', html, 'utf8');

const siteAssetsContent = `export const STYLES_CSS = ${JSON.stringify(stylesCss)};\r\n\r\n` +
  `export const HTML_INDEX = ${JSON.stringify(html)};\r\n\r\n` +
  `export const CLIENT_JS = ${JSON.stringify(clientJs)};\r\n\r\n` +
  `export const MAPS_ENGINE_JS = ${JSON.stringify(mapsEngineJs)};\r\n\r\n` +
  `export const OZPRO_MARK_SVG = ${JSON.stringify(ozproMarkSvg)};\r\n`;

fs.writeFileSync('site-assets.js', siteAssetsContent, 'utf8');
console.log('Generated index.html and site-assets.js for rotas-pro successfully!');
