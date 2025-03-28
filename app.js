/**
 * シンプルなオブジェクト操作アプリケーション
 * - EventBusなどの複雑な構造を排除
 * - 直接的なコーディングスタイルで実装
 */

// アプリケーション設定
const CONFIG = {
    // 手のトラッキング設定
    handTracking: {
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    },
    
    // オブジェクト設定
    objects: {
        count: 10,
        minSize: 30,
        maxSize: 60,
        colors: [
            '#ff0000', // 赤
            '#00ff00', // 緑
            '#0000ff', // 青
            '#ffff00', // 黄
            '#ff00ff', // マゼンタ
            '#00ffff', // シアン
            '#ff8000', // オレンジ
            '#8000ff'  // 紫
        ]
    },
    
    // 物理設定
    physics: {
        gravity: 0.05,           // 重力を弱く
        friction: 0.97,
        contactRadius: 40,        // 接触判定の距離
        pinchDistance: 60,        // つまむ判定の距離
        forceScale: 1.0,          // 力を弱く
        maxSpeed: 15
    }
};

// アプリケーションクラス
class App {
    constructor() {
        // HTMLエレメント
        this.videoElement = document.getElementById('video');
        this.handCanvas = document.getElementById('handCanvas');
        this.gameCanvas = document.getElementById('gameCanvas');
        this.infoElement = document.getElementById('info');
        this.startButton = document.getElementById('startBtn');
        this.resetButton = document.getElementById('resetBtn');
        
        // キャンバスコンテキスト
        this.handCtx = this.handCanvas.getContext('2d');
        this.gameCtx = this.gameCanvas.getContext('2d');
        
        // メディアパイプ
        this.hands = null;
        this.camera = null;
        
        // アプリケーション状態
        this.isRunning = false;
        this.handData = null;  // 手のトラッキングデータ
        this.objects = [];     // ゲームオブジェクト
        this.grabbedObjects = new Map(); // 掴んでいるオブジェクト
        
        // キャンバスサイズの設定
        this.resizeCanvases();
        window.addEventListener('resize', () => this.resizeCanvases());
        
        // ボタンイベントのセットアップ
        this.setupEventListeners();
        
        // メディアパイプの初期化
        this.initializeMediaPipe();
        
        // アニメーションループの開始
        this.lastFrameTime = 0;
        this.animate(0);
        
        console.log('アプリケーションが初期化されました');
    }
    
    // キャンバスのリサイズ
    resizeCanvases() {
        const container = document.querySelector('.canvas-container');
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        this.handCanvas.width = width;
        this.handCanvas.height = height;
        this.gameCanvas.width = width;
        this.gameCanvas.height = height;
        
        console.log(`キャンバスサイズを設定しました: ${width}x${height}`);
    }
    
    // イベントリスナーのセットアップ
    setupEventListeners() {
        this.startButton.addEventListener('click', () => this.startCamera());
        this.resetButton.addEventListener('click', () => this.resetObjects());
    }
    
    // MediaPipeの初期化
    initializeMediaPipe() {
        this.hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });
        
        this.hands.setOptions({
            maxNumHands: CONFIG.handTracking.maxNumHands,
            modelComplexity: CONFIG.handTracking.modelComplexity,
            minDetectionConfidence: CONFIG.handTracking.minDetectionConfidence,
            minTrackingConfidence: CONFIG.handTracking.minTrackingConfidence
        });
        
        this.hands.onResults(results => this.processHandResults(results));
        
        console.log('MediaPipe Handsが初期化されました');
    }
    
    // カメラの開始
    startCamera() {
        if (this.isRunning) return;
        
        this.camera = new Camera(this.videoElement, {
            onFrame: async () => {
                await this.hands.send({ image: this.videoElement });
            },
            width: 1280,
            height: 720
        });
        
        this.camera.start()
            .then(() => {
                console.log('カメラが起動しました');
                this.isRunning = true;
                this.infoElement.textContent = 'ステータス: カメラ動作中';
                
                // オブジェクトの生成
                this.resetObjects();
            })
            .catch(error => {
                console.error('カメラの起動に失敗しました:', error);
                this.infoElement.textContent = 'ステータス: カメラエラー';
            });
    }
    
    // カメラの停止
    stopCamera() {
        if (!this.isRunning) return;
        
        this.camera.stop();
        this.isRunning = false;
        console.log('カメラが停止しました');
        this.infoElement.textContent = 'ステータス: 停止';
    }
    
    // ハンドトラッキングの結果処理
    processHandResults(results) {
        // 手の検出データがない場合
        if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
            this.handData = null;
            return;
        }
        
        // 検出された手のデータを処理
        const hands = [];
        
        results.multiHandLandmarks.forEach((landmarks, index) => {
            const handInfo = {
                landmarks: [],
                fingers: {
                    thumb: { tip: null, base: null },
                    index: { tip: null, base: null },
                    middle: { tip: null, base: null },
                    ring: { tip: null, base: null },
                    pinky: { tip: null, base: null }
                },
                palmCenter: null,
                isPinching: false,
                handedness: results.multiHandedness[index].label
            };
            
            // ランドマークの座標変換
            landmarks.forEach((landmark, i) => {
                // MediaPipeの座標を画面座標に変換 (x軸のみ反転)
                const x = (1 - landmark.x) * this.handCanvas.width;
                const y = landmark.y * this.handCanvas.height; // 上下は反転しない
                const z = landmark.z * 100;
                
                handInfo.landmarks[i] = { x, y, z };
            });
            
            // 指先の位置を設定
            handInfo.fingers.thumb.tip = handInfo.landmarks[4];
            handInfo.fingers.index.tip = handInfo.landmarks[8];
            handInfo.fingers.middle.tip = handInfo.landmarks[12];
            handInfo.fingers.ring.tip = handInfo.landmarks[16];
            handInfo.fingers.pinky.tip = handInfo.landmarks[20];
            
            // 指の付け根の位置を設定
            handInfo.fingers.thumb.base = handInfo.landmarks[2];
            handInfo.fingers.index.base = handInfo.landmarks[5];
            handInfo.fingers.middle.base = handInfo.landmarks[9];
            handInfo.fingers.ring.base = handInfo.landmarks[13];
            handInfo.fingers.pinky.base = handInfo.landmarks[17];
            
            // 手のひらの中心を計算
            handInfo.palmCenter = {
                x: (handInfo.landmarks[0].x + handInfo.landmarks[9].x) / 2,
                y: (handInfo.landmarks[0].y + handInfo.landmarks[9].y) / 2,
                z: (handInfo.landmarks[0].z + handInfo.landmarks[9].z) / 2
            };
            
            // つまむジェスチャーの検出
            const thumbTip = handInfo.fingers.thumb.tip;
            const indexTip = handInfo.fingers.index.tip;
            const distance = Math.sqrt(
                Math.pow(thumbTip.x - indexTip.x, 2) +
                Math.pow(thumbTip.y - indexTip.y, 2)
            );
            
            handInfo.isPinching = distance < CONFIG.physics.pinchDistance;
            
            hands.push(handInfo);
        });
        
        this.handData = hands;
    }
    
    // オブジェクトのリセット（再生成）
    resetObjects() {
        this.objects = [];
        this.grabbedObjects.clear();
        
        // キャンバスを格子状に分割してオブジェクトを配置
        const gridCols = 5;
        const gridRows = 4;
        const cellWidth = this.gameCanvas.width / gridCols;
        const cellHeight = this.gameCanvas.height / gridRows;
        
        for (let row = 0; row < gridRows; row++) {
            for (let col = 0; col < gridCols; col++) {
                // 配置可能なオブジェクト数を超えたら終了
                if (this.objects.length >= CONFIG.objects.count) continue;
                
                // セル内のランダムな位置を計算
                const x = col * cellWidth + Math.random() * cellWidth;
                const y = row * cellHeight + Math.random() * cellHeight;
                
                // オブジェクトのサイズと色をランダムに設定
                const size = Math.random() * (CONFIG.objects.maxSize - CONFIG.objects.minSize) + CONFIG.objects.minSize;
                const colorIndex = Math.floor(Math.random() * CONFIG.objects.colors.length);
                const color = CONFIG.objects.colors[colorIndex];
                
                // 円か四角かをランダムに決定
                const isCircle = Math.random() > 0.5;
                
                // オブジェクトを生成して配列に追加
                this.objects.push({
                    x: x,
                    y: y,
                    size: size,
                    color: color,
                    isCircle: isCircle,
                    vx: 0,
                    vy: 0,
                    isGrabbed: false,
                    grabbedBy: -1
                });
            }
        }
        
        console.log(`${this.objects.length}個のオブジェクトを生成しました`);
    }
    
    // アニメーションループ
    animate(timestamp) {
        const deltaTime = timestamp - this.lastFrameTime;
        this.lastFrameTime = timestamp;
        
        // キャンバスのクリア
        this.clearCanvases();
        
        // 手の描画
        this.drawHands();
        
        // 物理演算の更新
        if (this.isRunning) {
            this.updatePhysics(deltaTime);
        }
        
        // オブジェクトの描画
        this.drawObjects();
        
        // 次のフレームのリクエスト
        requestAnimationFrame(time => this.animate(time));
    }
    
    // キャンバスのクリア
    clearCanvases() {
        this.handCtx.clearRect(0, 0, this.handCanvas.width, this.handCanvas.height);
        this.gameCtx.clearRect(0, 0, this.gameCanvas.width, this.gameCanvas.height);
    }
    
    // 手の描画
    drawHands() {
        if (!this.handData) return;
        
        this.handCtx.lineWidth = 3;
        this.handCtx.lineCap = 'round';
        
        this.handData.forEach(hand => {
            // 手の接続を描画
            this.drawHandConnections(hand);
            
            // 指先のマーカーを描画
            this.drawFingerTips(hand);
            
            // つまみジェスチャーの視覚化
            if (hand.isPinching) {
                this.drawPinchGesture(hand);
            }
        });
    }
    
    // 手の接続線を描画
    drawHandConnections(hand) {
        const connections = [
            // 親指
            [0, 1], [1, 2], [2, 3], [3, 4],
            // 人差し指
            [0, 5], [5, 6], [6, 7], [7, 8],
            // 中指
            [0, 9], [9, 10], [10, 11], [11, 12],
            // 薬指
            [0, 13], [13, 14], [14, 15], [15, 16],
            // 小指
            [0, 17], [17, 18], [18, 19], [19, 20],
            // 手のひら
            [0, 5], [5, 9], [9, 13], [13, 17]
        ];
        
        this.handCtx.strokeStyle = 'cyan';
        this.handCtx.beginPath();
        
        connections.forEach(([start, end]) => {
            const startPoint = hand.landmarks[start];
            const endPoint = hand.landmarks[end];
            
            this.handCtx.moveTo(startPoint.x, startPoint.y);
            this.handCtx.lineTo(endPoint.x, endPoint.y);
        });
        
        this.handCtx.stroke();
    }
    
    // 指先のマーカーを描画
    drawFingerTips(hand) {
        const fingerTips = [4, 8, 12, 16, 20];
        
        fingerTips.forEach(tipIndex => {
            const tip = hand.landmarks[tipIndex];
            
            this.handCtx.fillStyle = 'white';
            this.handCtx.beginPath();
            this.handCtx.arc(tip.x, tip.y, 8, 0, Math.PI * 2);
            this.handCtx.fill();
        });
    }
    
    // つまむジェスチャーの視覚化
    drawPinchGesture(hand) {
        const thumbTip = hand.fingers.thumb.tip;
        const indexTip = hand.fingers.index.tip;
        
        this.handCtx.strokeStyle = 'red';
        this.handCtx.lineWidth = 5;
        this.handCtx.beginPath();
        this.handCtx.moveTo(thumbTip.x, thumbTip.y);
        this.handCtx.lineTo(indexTip.x, indexTip.y);
        this.handCtx.stroke();
        
        // つまんでいる中心点
        const midX = (thumbTip.x + indexTip.x) / 2;
        const midY = (thumbTip.y + indexTip.y) / 2;
        
        this.handCtx.fillStyle = 'yellow';
        this.handCtx.beginPath();
        this.handCtx.arc(midX, midY, 10, 0, Math.PI * 2);
        this.handCtx.fill();
    }
    
    // 物理演算の更新
    updatePhysics(deltaTime) {
        // デルタタイムを正規化（60FPSを基準）
        const normalizedDelta = deltaTime / 16.67;
        
        // 手のデータがある場合、オブジェクトとの相互作用を処理
        if (this.handData) {
            this.processHandObjectInteractions();
        }
        
        // 各オブジェクトの物理更新
        this.objects.forEach(obj => {
            // 掴まれていないオブジェクトのみ更新
            if (!obj.isGrabbed) {
                // 重力を適用
                obj.vy += CONFIG.physics.gravity * normalizedDelta;
                
                // 摩擦を適用
                obj.vx *= CONFIG.physics.friction;
                obj.vy *= CONFIG.physics.friction;
                
                // 速度上限を適用
                const speed = Math.sqrt(obj.vx * obj.vx + obj.vy * obj.vy);
                if (speed > CONFIG.physics.maxSpeed) {
                    const ratio = CONFIG.physics.maxSpeed / speed;
                    obj.vx *= ratio;
                    obj.vy *= ratio;
                }
                
                // 位置の更新
                obj.x += obj.vx * normalizedDelta;
                obj.y += obj.vy * normalizedDelta;
                
                // 画面端での反射
                this.handleBoundaryCollisions(obj);
            }
        });
    }
    
    // 手とオブジェクトの相互作用処理
    processHandObjectInteractions() {
        // 掴みデータをリセット
        const newGrabbedObjects = new Map();
        
        // 各手について処理
        this.handData.forEach((hand, handIndex) => {
            // つまみ検出中のオブジェクト
            let pinnedObject = null;
            let closestDistance = Infinity;
            
            // つまみジェスチャー検出
            if (hand.isPinching) {
                const pinchCenter = {
                    x: (hand.fingers.thumb.tip.x + hand.fingers.index.tip.x) / 2,
                    y: (hand.fingers.thumb.tip.y + hand.fingers.index.tip.y) / 2
                };
                
                // 最も近いオブジェクトを探す
                this.objects.forEach(obj => {
                    const distance = Math.sqrt(
                        Math.pow(obj.x - pinchCenter.x, 2) +
                        Math.pow(obj.y - pinchCenter.y, 2)
                    );
                    
                    // 接触半径内で最も近いオブジェクトを選択
                    if (distance < obj.size + CONFIG.physics.contactRadius && distance < closestDistance) {
                        closestDistance = distance;
                        pinnedObject = obj;
                    }
                });
                
                // オブジェクトが見つかった場合、掴む
                if (pinnedObject) {
                    pinnedObject.isGrabbed = true;
                    pinnedObject.grabbedBy = handIndex;
                    
                    // 掴んだオブジェクトの位置を更新
                    pinnedObject.x = pinchCenter.x;
                    pinnedObject.y = pinchCenter.y;
                    
                    // 速度をリセット
                    pinnedObject.vx = 0;
                    pinnedObject.vy = 0;
                    
                    // 掴んでいるオブジェクトとして記録
                    newGrabbedObjects.set(pinnedObject, handIndex);
                }
            }
            
            // 各指に対する接触チェック
            const fingerTips = [
                hand.fingers.thumb.tip,
                hand.fingers.index.tip,
                hand.fingers.middle.tip,
                hand.fingers.ring.tip,
                hand.fingers.pinky.tip
            ];
            
            fingerTips.forEach(tip => {
                this.objects.forEach(obj => {
                    // 掴まれているオブジェクトはスキップ
                    if (obj.isGrabbed) return;
                    
                    // 指との距離を計算
                    const distance = Math.sqrt(
                        Math.pow(obj.x - tip.x, 2) +
                        Math.pow(obj.y - tip.y, 2)
                    );
                    
                    // 接触判定
                    if (distance < obj.size + CONFIG.physics.contactRadius) {
                        // 接触時の力を計算（弱めに）
                        const forceX = (obj.x - tip.x) * CONFIG.physics.forceScale / (distance + 1);
                        const forceY = (obj.y - tip.y) * CONFIG.physics.forceScale / (distance + 1);
                        
                        // 力を加える
                        obj.vx += forceX;
                        obj.vy += forceY;
                    }
                });
            });
        });
        
        // 掴んでいないオブジェクトのリセット
        this.objects.forEach(obj => {
            if (!newGrabbedObjects.has(obj)) {
                obj.isGrabbed = false;
                obj.grabbedBy = -1;
            }
        });
        
        // 掴んでいるオブジェクトを更新
        this.grabbedObjects = newGrabbedObjects;
    }
    
    // 画面端の衝突処理
    handleBoundaryCollisions(obj) {
        const halfSize = obj.size / 2;
        
        // 左右の境界
        if (obj.x - halfSize < 0) {
            obj.x = halfSize;
            obj.vx = -obj.vx * 0.7;
        } else if (obj.x + halfSize > this.gameCanvas.width) {
            obj.x = this.gameCanvas.width - halfSize;
            obj.vx = -obj.vx * 0.7;
        }
        
        // 上下の境界
        if (obj.y - halfSize < 0) {
            obj.y = halfSize;
            obj.vy = -obj.vy * 0.7;
        } else if (obj.y + halfSize > this.gameCanvas.height) {
            obj.y = this.gameCanvas.height - halfSize;
            obj.vy = -obj.vy * 0.7;
        }
    }
    
    // オブジェクトの描画
    drawObjects() {
        this.gameCtx.shadowBlur = 10;
        this.gameCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        
        this.objects.forEach(obj => {
            this.gameCtx.fillStyle = obj.color;
            
            // 掴まれている場合は輝くエフェクト
            if (obj.isGrabbed) {
                this.gameCtx.shadowBlur = 20;
                this.gameCtx.shadowColor = 'rgba(255, 255, 0, 0.7)';
            } else {
                this.gameCtx.shadowBlur = 10;
                this.gameCtx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            }
            
            if (obj.isCircle) {
                // 円を描画
                this.gameCtx.beginPath();
                this.gameCtx.arc(obj.x, obj.y, obj.size / 2, 0, Math.PI * 2);
                this.gameCtx.fill();
            } else {
                // 四角形を描画
                this.gameCtx.fillRect(
                    obj.x - obj.size / 2,
                    obj.y - obj.size / 2,
                    obj.size,
                    obj.size
                );
            }
        });
    }
}

// アプリケーションの起動
document.addEventListener('DOMContentLoaded', () => {
    const app = new App();
});
