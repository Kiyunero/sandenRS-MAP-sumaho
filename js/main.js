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

const STAMP_LAYERS = [
    'images/stamp_layer_1.png',
    'images/stamp_layer_2.png',
    'images/stamp_layer_3.png',
    'images/stamp_layer_4.png',
    'images/stamp_layer_5.png',
];

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
                // ▼▼▼ 動的なマップ表示サイズを保存するデータを追加 ▼▼▼
                displaySize: { width: 0, height: 0 },
                // ▲▲▲ ここまで追加 ▲▲▲
            };
        },
        computed: {
            completedStamps() {
                if (!this.userProfile || !this.userProfile.questProgress) return [];
                const completedCount = Object.values(this.userProfile.questProgress)
                    .filter(status => status === 'completed').length;
                return STAMP_LAYERS.slice(0, completedCount);
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
                // ▼▼▼ 判定に動的な表示サイズを使用するよう変更 ▼▼▼
                const imageWidth = this.displaySize.width;
                const imageHeight = this.displaySize.height;
                // ▲▲▲ ここまで変更 ▲▲▲

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
                // ▼▼▼ 判定に動的な表示サイズを使用するよう変更 ▼▼▼
                const imageWidth = this.displaySize.width;
                const imageHeight = this.displaySize.height;
                // ▲▲▲ ここまで変更 ▲▲▲
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
            
            // ▼▼▼ マップサイズの計算処理を実行＆リサイズイベント監視を追加 ▼▼▼
            this.updateMapDimensions();
            window.addEventListener('resize', this.updateMapDimensions);
            // ▲▲▲ ここまで追加 ▲▲▲
        },
        // ▼▼▼ リサイズイベントの監視を解除する処理を追加 ▼▼▼
        beforeUnmount() {
            window.removeEventListener('resize', this.updateMapDimensions);
        },
        // ▲▲▲ ここまで追加 ▲▲▲
        methods: {
            // ▼▼▼ マップの表示サイズを計算するメソッドを追加 ▼▼▼
            updateMapDimensions() {
                const container = document.getElementById('map-container');
                if (!container) return;

                const containerWidth = container.clientWidth;
                const originalWidth = this.mapConfig.imageSize.width;
                const originalHeight = this.mapConfig.imageSize.height;

                if (originalWidth < containerWidth) {
                    // 画像の幅がコンテナより狭い場合、コンテナ幅に合わせて拡大
                    const scaleFactor = containerWidth / originalWidth;
                    this.displaySize = {
                        width: containerWidth,
                        height: originalHeight * scaleFactor
                    };
                } else {
                    // 画像の幅がコンテナより広い場合は、そのままのサイズで表示
                    this.displaySize = {
                        width: originalWidth,
                        height: originalHeight
                    };
                }
            },
            // ▲▲▲ ここまで追加 ▲▲▲
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
                        this.userProfile = doc.data();
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
                // ▼▼▼ 計算基準を元の画像サイズから動的な表示サイズに変更 ▼▼▼
                const { topLeft, bottomRight } = this.mapConfig;
                const imageSize = this.displaySize;
                // ▲▲▲ ここまで変更 ▲▲▲
                
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
            }
        }
    });
    window.pwaVueApp = app.mount('#app');
}