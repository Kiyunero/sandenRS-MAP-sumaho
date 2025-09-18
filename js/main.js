// 【重要】Firebaseプロジェクト作成時にコピーした設定情報をここに貼り付けます
const firebaseConfig = {
    apiKey: "AIzaSyAxZffh198by405B4t64hTMyEFatYiX92A",
    authDomain: "point-tuika.firebaseapp.com",
    projectId: "point-tuika",
    storageBucket: "point-tuika.firebasestorage.app",
    messagingSenderId: "763384904606",
    appId: "1:763384904606:web:8d7556d0089b5f9f08b48f"
  };

// Firebaseアプリの初期化
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- 設定項目 ---
// スタンプのレイヤー画像
const STAMP_LAYERS = [
    'images/stamp_layer_1.png',
    'images/stamp_layer_2.png',
    'images/stamp_layer_3.png',
    'images/stamp_layer_4.png',
    'images/stamp_layer_5.png',
];

// コンプリートに必要なスタンプの数
const STAMP_COMPLETE_COUNT = 1;

// コンプリート時の報酬画像リスト（複数登録可能）
const REWARD_IMAGES = [
    { name: 'コンプリート報酬', url: 'images/special_reward.png' },
    // { name: '追加の報酬画像', url: 'images/special_reward_2.png' }, // 追する場合はこのように記述
];

// コンプリート時の合言葉
const COMPLETE_SECRET_CODE = '123456'; 
// --- 設定項目ここまで ---

function initPwaMap() {
    const app = Vue.createApp({
        data() {
            return {
                loading: true,
                userId: null,
                authToken: null,
                isTokenLoading: false,
                errorMessage: '',
                isScannerVisible: false,
                scanResultMessage: '',
                scanResultClass: '',
                videoStream: null,
                userProfile: null,
                allQuests: [],
                spots: [],
                userListener: null,
                oshis: [
                    { id: 1, name: 'キャラ1', icon: 'images/oshi_1.png' },
                    { id: 2, name: 'キャラ2', icon: 'images/oshi_2.png' },
                    { id: 3, name: 'キャラ3', icon: 'images/oshi_3.png' },
                    { id: 4, name: 'キャラ4', icon: 'images/oshi_4.png' },
                    { id: 5, name: 'キャラ5', icon: 'images/oshi_5.png' },
                ],
                myOshi: 1,
                isQuestStartAnimationVisible: false,
                isQuestClearAnimationVisible: false,
                mapConfig: {
                    imageSrc: 'images/サンデン実験室マップ.png', 
                    topLeft: { lat: 36.4664361923701, lng: 139.20553199268807 }, 
                    bottomRight: { lat: 36.4657452231761, lng: 139.20475324598635 },
                    imageSize: { width: 850, height: 478 } 
                },
                userGpsPosition: { lat: null, lng: null },
                userPixelPosition: { x: null, y: null },
                activeSpot: null,
                displaySize: { width: 0, height: 0 },
                isCompleteScreenVisible: false, // コンプリート画面の表示状態
                rewardImages: REWARD_IMAGES, // 報酬画像のリスト
                completeSecretCode: COMPLETE_SECRET_CODE, // 合言葉
            };
        },
        computed: {
            completedQuestCount() {
                if (!this.userProfile || !this.userProfile.questProgress) return 0;
                return Object.values(this.userProfile.questProgress)
                    .filter(status => status === 'completed').length;
            },
            completedStamps() {
                return STAMP_LAYERS.slice(0, this.completedQuestCount);
            },
            isStampCompleted() {
                return this.completedQuestCount >= STAMP_COMPLETE_COUNT;
            },
            inProgressQuests() {
                if (!this.userProfile || !this.userProfile.questProgress || this.allQuests.length === 0) return [];
                const inProgressQuestIds = Object.keys(this.userProfile.questProgress)
                    .filter(questId => this.userProfile.questProgress[questId] === 'in_progress');
                return this.allQuests.filter(quest => inProgressQuestIds.includes(quest.id));
            },
            oshiIconUrl() {
                const selectedOshi = this.oshis.find(o => o.id === this.myOshi);
                return selectedOshi ? selectedOshi.icon : '';
            },
            spotsWithPixelPosition() {
                const imageWidth = this.displaySize.width;
                const imageHeight = this.displaySize.height;

                return this.spots.map(spot => {
                    const spotGps = {
                        lat: parseFloat(spot.latitude),
                        lng: parseFloat(spot.longitude)
                    };
                    return {
                        ...spot,
                        pixelPosition: this.convertGpsToPixel(spotGps)
                    };
                }).filter(spot => {
                    const px = spot.pixelPosition.x;
                    const py = spot.pixelPosition.y;
                    return px >= 0 && px <= imageWidth && py >= 0 && py <= imageHeight;
                });
            },
            isUserOnMap() {
                if (this.userPixelPosition.x === null || this.userPixelPosition.y === null) {
                    return false;
                }
                const px = this.userPixelPosition.x;
                const py = this.userPixelPosition.y;
                const imageWidth = this.displaySize.width;
                const imageHeight = this.displaySize.height;
                return px >= 0 && px <= imageWidth && py >= 0 && py <= imageHeight;
            }
        },
        async mounted() {
            const savedOshi = localStorage.getItem('myOshi');
            if (savedOshi) {
                this.myOshi = parseInt(savedOshi, 10);
            }
            await this.initializeUser();
            this.loading = false;
            
            await this.$nextTick();
            this.startGpsTracking();
            
            this.updateMapDimensions();
            window.addEventListener('resize', this.updateMapDimensions);

            // ▼▼▼ 変更箇所 ▼▼▼
            this.initializeResizer(); // リサイズハンドルの機能を初期化
            // ▲▲▲ 変更箇所 ▲▲▲

            if (this.isStampCompleted) {
                this.showCompleteScreen();
            }
        },
        beforeUnmount() {
            window.removeEventListener('resize', this.updateMapDimensions);
        },
        methods: {
            // ▼▼▼ 変更箇所 ▼▼▼
            // 地図リサイズ機能の初期化
            initializeResizer() {
                const resizer = document.getElementById('resizer');
                const mapContainer = document.getElementById('map-container');
                if (!resizer || !mapContainer) return;
            
                const doResize = (e) => {
                    // Y座標を取得（タッチイベントとマウスイベントの両方に対応）
                    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                    
                    // 新しい高さを計算
                    const newHeight = clientY - mapContainer.getBoundingClientRect().top;
            
                    // 高さの最小値と最大値を設定
                    const minHeight = 20; // px
                    const maxHeight = window.innerHeight * 0.6; // 画面の高さの60%まで
            
                    if (newHeight > minHeight && newHeight < maxHeight) {
                        mapContainer.style.height = `${newHeight}px`;
                        // 地図内の要素を再計算させるために`updateMapDimensions`を呼び出す
                        this.updateMapDimensions();
                    }
                };
            
                const stopResize = () => {
                    window.removeEventListener('mousemove', doResize);
                    window.removeEventListener('mouseup', stopResize);
                    window.removeEventListener('touchmove', doResize);
                    window.removeEventListener('touchend', stopResize);
                };
            
                const startResize = (e) => {
                    e.preventDefault();
                    window.addEventListener('mousemove', doResize);
                    window.addEventListener('mouseup', stopResize);
                    window.addEventListener('touchmove', doResize, { passive: false });
                    window.addEventListener('touchend', stopResize);
                };
            
                resizer.addEventListener('mousedown', startResize);
                resizer.addEventListener('touchstart', startResize, { passive: false });
            },
            // ▲▲▲ 変更箇所 ▲▲▲
            updateMapDimensions() {
                const container = document.getElementById('map-container');
                if (!container) return;

                const containerWidth = container.clientWidth;
                // ▼▼▼ 変更箇所 ▼▼▼
                const containerHeight = container.clientHeight; // 現在の高さを取得
                // ▲▲▲ 変更箇所 ▲▲▲
                const originalWidth = this.mapConfig.imageSize.width;
                const originalHeight = this.mapConfig.imageSize.height;

                const widthRatio = containerWidth / originalWidth;
                const heightRatio = containerHeight / originalHeight;
                
                // アスペクト比を維持し、コンテナに収まるようにスケールを決定
                const scale = Math.min(widthRatio, heightRatio);

                this.displaySize = {
                    width: originalWidth * scale,
                    height: originalHeight * scale
                };
            },
            async initializeUser() {
                let savedUserId = localStorage.getItem('questAppUserId');
                if (savedUserId) {
                    this.userId = savedUserId;
                } else {
                    savedUserId = this.generateUniqueId();
                    localStorage.setItem('questAppUserId', savedUserId);
                    this.userId = savedUserId;
                }
                await Promise.all([this.fetchAllQuests(), this.fetchAllSpots()]);
                this.attachUserListener();
            },
            generateUniqueId() {
                return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
            },
            attachUserListener() {
                if (this.userListener) this.userListener();
                const userRef = db.collection("users").doc(this.userId);
                this.userListener = userRef.onSnapshot((doc) => {
                    console.log("スマホアプリ側でユーザーデータの更新を検知しました。");
                    if (doc.exists) {
                        const oldQuestCount = this.completedQuestCount;
                        this.userProfile = doc.data();
                        if (this.isStampCompleted && oldQuestCount < STAMP_COMPLETE_COUNT) {
                           this.showCompleteScreen();
                        }
                    } else {
                        const newUserProfile = { userId: this.userId, questProgress: {}, points: 0 };
                        userRef.set(newUserProfile);
                        this.userProfile = newUserProfile;
                    }
                });
            },
            async fetchAllQuests() {
                const questsSnapshot = await db.collection('quests').get();
                this.allQuests = questsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            },
            async fetchAllSpots() {
                const spotsSnapshot = await db.collection('spots').get();
                this.spots = spotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            },
            startGpsTracking() {
                if (!navigator.geolocation) {
                    this.errorMessage = "お使いのブラウザは位置情報機能に対応していません。";
                    return;
                }
                navigator.geolocation.watchPosition(
                    (position) => {
                        this.userGpsPosition = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                        };
                        this.userPixelPosition = this.convertGpsToPixel(this.userGpsPosition);
                    },
                    (error) => {
                        console.error("GPSエラー:", error);
                        this.errorMessage = `位置情報の取得に失敗しました。ブラウザの位置情報サービスを許可してください。`;
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 0
                    }
                );
            },
            convertGpsToPixel(gps) {
                const { topLeft, bottomRight } = this.mapConfig;
                const imageSize = this.displaySize;
                
                if (!gps || gps.lat === null || gps.lng === null || imageSize.width === 0) {
                    return { x: null, y: null };
                }
                
                const latRange = topLeft.lat - bottomRight.lat;
                if (latRange === 0) return { x: null, y: null };
                const xPercent = (topLeft.lat - gps.lat) / latRange;

                const lngRange = topLeft.lng - bottomRight.lng;
                if (lngRange === 0) return { x: null, y: null };
                const yPercent = (topLeft.lng - gps.lng) / lngRange;
            
                const pixelX = imageSize.width * xPercent;
                const pixelY = imageSize.height * yPercent;
                
                return { x: pixelX, y: pixelY };
            },
            isQuestCompleted(questId) {
                return this.userProfile?.questProgress[questId] === 'completed';
            },
            toggleSpotInfo(spot) {
                if (this.activeSpot && this.activeSpot.id === spot.id) {
                    this.activeSpot = null;
                } else {
                    this.activeSpot = spot;
                }
            },
            setMyOshi(oshiId) {
                this.myOshi = oshiId;
                localStorage.setItem('myOshi', oshiId);
            },
            async generateAuthToken() {
                this.isTokenLoading = true;
                this.authToken = null;
                this.errorMessage = '';
                try {
                    const token = Math.floor(100000 + Math.random() * 900000).toString();
                    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
                    await db.collection('authTokens').doc(token).set({
                        userId: this.userId,
                        expiresAt: firebase.firestore.Timestamp.fromDate(expiresAt)
                    });
                    this.authToken = token;
                } catch (error) {
                    console.error("合言葉の発行に失敗しました: ", error);
                    this.errorMessage = "エラーが発生しました。時間をおいて再度お試しください。";
                } finally {
                    this.isTokenLoading = false;
                }
            },
            async startScanner() {
                this.isScannerVisible = true;
                this.scanResultMessage = '';
                this.$nextTick(async () => {
                    const video = document.getElementById('scanner-video');
                    if (!video) {
                        console.error("スキャナーのvideo要素が見つかりません。");
                        this.isScannerVisible = false;
                        return;
                    }
                    try {
                        this.videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
                        video.srcObject = this.videoStream;
                        video.play();
                        requestAnimationFrame(this.tick.bind(this));
                    } catch (err) {
                        console.error("カメラの起動に失敗:", err);
                        this.scanResultMessage = "カメラの起動に失敗しました。カメラのアクセスを許可してください。";
                        this.scanResultClass = "alert-danger";
                        this.isScannerVisible = false;
                    }
                });
            },
            stopScanner() {
                if (this.videoStream) {
                    this.videoStream.getTracks().forEach(track => track.stop());
                }
                this.isScannerVisible = false;
            },
            tick() {
                if (!this.isScannerVisible) return;
                const video = document.getElementById('scanner-video');
                if (video.readyState === video.HAVE_ENOUGH_DATA) {
                    const canvasElement = document.createElement('canvas');
                    const canvas = canvasElement.getContext('2d');
                    canvasElement.width = video.videoWidth;
                    canvasElement.height = video.videoHeight;
                    canvas.drawImage(video, 0, 0, canvasElement.width, canvasElement.height);
                    const imageData = canvas.getImageData(0, 0, canvasElement.width, canvasElement.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
                    if (code) {
                        this.stopScanner();
                        this.handleQrCode(code.data);
                        return;
                    }
                }
                requestAnimationFrame(this.tick.bind(this));
            },
            async handleQrCode(qrCodeValue) {
                try {
                    const userRef = db.collection("users").doc(this.userId);
                    if (qrCodeValue.startsWith('QUEST_START::')) {
                        const questId = qrCodeValue.split('::')[1];
                        if (this.userProfile.questProgress[questId]) {
                            this.scanResultMessage = `このクエストは既に開始済み、またはクリア済みです。`;
                            this.scanResultClass = "alert-warning";
                            return;
                        }
                        await userRef.set({
                            questProgress: { [questId]: "in_progress" }
                        }, { merge: true });
                        this.scanResultMessage = `クエストを開始しました！`;
                        this.scanResultClass = "alert-info";
                        this.playQuestStartAnimation();
                    } else {
                        const questsRef = db.collection("quests");
                        const querySnapshot = await questsRef.where("clearQRCodeValue", "==", qrCodeValue).get();
                        if (querySnapshot.empty) {
                            this.scanResultMessage = "無効なQRコードです。";
                            this.scanResultClass = "alert-warning";
                            return;
                        }
                        const questDoc = querySnapshot.docs[0];
                        const questId = questDoc.id;
                        const questData = questDoc.data();
                        const questPoints = questData.points || 0;
                        if (this.userProfile.questProgress[questId] === 'completed') {
                            this.scanResultMessage = `クエスト「${questData.title}」は既にクリア済みです。`;
                            this.scanResultClass = "alert-warning";
                            return;
                        }
                        await db.runTransaction(async (transaction) => {
                            const userDoc = await transaction.get(userRef);
                            if (!userDoc.exists) throw "User document not found!";
                            const currentPoints = userDoc.data().points || 0;
                            const newPoints = currentPoints + questPoints;
                            const newQuestProgress = { ...userDoc.data().questProgress, [questId]: "completed" };
                            transaction.update(userRef, { 
                                questProgress: newQuestProgress,
                                points: newPoints 
                            });
                        });
                        this.scanResultMessage = `クエスト「${questData.title}」をクリア！ ${questPoints}ポイント獲得！`;
                        this.scanResultClass = "alert-success";
                        this.playQuestClearAnimation();
                    }
                } catch (error) {
                    console.error("QRコード処理エラー:", error);
                    this.scanResultMessage = "QRコードの処理中にエラーが発生しました。";
                    this.scanResultClass = "alert-danger";
                }
            },
            playQuestStartAnimation() {
                this.isQuestStartAnimationVisible = true;
                this.$nextTick(() => {
                    const container = document.getElementById('lottie-start-container');
                    container.innerHTML = ''; 
                    const anim = lottie.loadAnimation({
                        container: container,
                        renderer: 'svg',
                        loop: false,
                        autoplay: true,
                        path: 'lottie/quest_start.json'
                    });
                    anim.addEventListener('complete', () => {
                        this.isQuestStartAnimationVisible = false;
                        anim.destroy();
                    });
                });
            },
            playQuestClearAnimation() {
                this.isQuestClearAnimationVisible = true;
                this.$nextTick(() => {
                    const container = document.getElementById('lottie-clear-container');
                    container.innerHTML = '';
                    const anim = lottie.loadAnimation({
                        container: container,
                        renderer: 'svg',
                        loop: false,
                        autoplay: true,
                        path: 'lottie/quest_clear.json'
                    });
                    anim.addEventListener('complete', () => {
                        this.isQuestClearAnimationVisible = false;
                        anim.destroy();
                    });
                });
            },
            showCompleteScreen() {
                this.isCompleteScreenVisible = true;
            },
            closeCompleteScreen() {
                this.isCompleteScreenVisible = false;
            },
            async downloadImage(imageUrl) {
                try {
                    const response = await fetch(imageUrl);
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = url;
                    const fileName = imageUrl.split('/').pop();
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    a.remove();
                } catch (error) {
                    console.error('画像のダウンロードに失敗しました:', error);
                    alert('画像のダウンロードに失敗しました。');
                }
            }
        }
    });
    window.pwaVueApp = app.mount('#app');
}