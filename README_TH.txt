NP RADAR V1 — DEPLOY READY (VERCEL)

สิ่งที่ทำได้
- แสดงตำแหน่งของผู้ใช้จาก GPS หลังผู้ใช้กดอนุญาต
- แสดงวงเฝ้าระวัง 5 / 10 / 20 กม.
- แสดง RainViewer global radar ย้อนหลังประมาณ 2 ชั่วโมง
- วิเคราะห์ฝนในวง 5 / 10 / 20 กม. จากหลายเฟรมเพื่อดูแนวโน้มเข้าใกล้/ออกห่าง
- ใช้ ECMWF IFS + NOAA GFS เป็นข้อมูลพยากรณ์ประกอบ 6 ชั่วโมง
- แจ้งเตือนบนหน้าเว็บและ Browser Notification เมื่อผู้ใช้เปิดสิทธิ์
- อัปเดตอัตโนมัติทุก 5 นาที
- PWA: Add to Home Screen ได้

สำคัญ
- Notification ใน V1 ทำงานเมื่อเว็บไซต์ยังเปิด/ยังทำงานอยู่บนอุปกรณ์
- ถ้าต้องการ Push Notification ตอนปิดเว็บสนิท ต้องเพิ่ม Web Push backend ใน V2
- NP Radar V1 เป็น decision-support ไม่ใช่ระบบเตือนภัยของทางราชการ

DEPLOY บน Vercel
1. แตก ZIP
2. นำโฟลเดอร์นี้ขึ้น GitHub หรือใช้ Vercel CLI
3. Import Project ใน Vercel
4. Deploy โดยไม่ต้องตั้ง Environment Variable
5. จะได้ URL HTTPS เช่น https://np-radar-v1.vercel.app
6. GPS ใช้งานได้เพราะ Vercel เป็น HTTPS

โครงสร้าง
- index.html                หน้าเว็บ
- api/rainviewer.js        proxy metadata RainViewer
- api/radar-image.js       proxy ภาพเรดาร์เพื่อใช้วิเคราะห์
- api/forecast.js          ECMWF / GFS proxy
- api/status.js            ตรวจ upstream
- manifest.webmanifest     PWA
- sw.js                    service worker
- icon-192.png / 512.png  ไอคอน

ชื่อหัวเว็บ: NP Radar V1

อัปเดต 1.1 — ระดับน้ำ ThaiWater
- แท็บ “ระดับน้ำ ThaiWater”: สถานีตรวจวัดแม่น้ำ/คลองทั่วประเทศ และรายการใกล้ GPS 5–100 กม.
- เวลาอ่านค่าของแต่ละสถานีแสดงเป็นเวลาไทย พร้อมระดับน้ำ ม.รทก. ระดับตลิ่ง และแหล่งข้อมูล
- สีใช้ storagePercent ตามเกณฑ์ ThaiWater: <=10, <=30, <=70, <=100, >100
  ไม่ใช้ waterlevelMslPercent แทน เพราะเป็นอัตราส่วนคนละความหมาย
- ข้อมูลเกิน 3 ชม. (เกณฑ์ความสดของแอป), ข้อมูลไม่ครบ หรือโหลดไม่สำเร็จ จะไม่แสดงสถานะปกติ
- พยากรณ์ระดับน้ำไม่เกิน 72 ชม. เฉพาะสถานี type=waterlevelForecast ที่ต้นทางมีข้อมูล
  ไม่รวม type=waterlevelRidForecast ซึ่งเป็นปริมาณการไหล ลบ.ม./วินาที
- กราฟใช้ foreValue จากต้นทาง ไม่คำนวณโมเดลใหม่ และไม่ส่งการแจ้งเตือนฝนจากค่าระดับน้ำ
- เวลาในกราฟเป็นเวลาไทย; API ขอ timezone=7 และแปลงเวลาที่ไม่มีเขตเวลาเป็น Asia/Bangkok
- ต้นทางไม่ระบุเวลารันโมเดล จึงแสดงเฉพาะเวลาดึงข้อมูล พร้อมบอกข้อจำกัดนี้บนกราฟ
- ระดับน้ำ ณ สถานีไม่ใช่ความลึกน้ำท่วมถนน และระยะใกล้ไม่ได้ยืนยันความเชื่อมโยงทางน้ำ
- เปิดตรงแท็บระดับน้ำ: /?view=water

แหล่งข้อมูลและการเชื่อมต่อ
- https://twa.thaiwater.net/th/map/flash-flood/water-level
- API: https://twa-api-public.thaiwater.net/v2/waterlevel
- รายการสถานีแบบจำลอง: /v2/waterlevel-discharge/forecast
- รายละเอียดชนิด/หน่วย: /v2/waterlevel-discharge/forecast/{stationId}/detail
- กราฟ: /data/platform/v1/public/latest_waterlevel/forecast/graph
- ใช้ client identifier สำหรับผู้เยี่ยมชมที่หน้าเว็บสาธารณะ ThaiWater ส่งอยู่แล้ว ไม่ใช้บัญชีส่วนตัว
  เปลี่ยนผ่าน THAIWATER_PUBLIC_CLIENT_ID ได้หากต้นทางหมุนค่าใหม่
- มี timeout และแคชฝั่ง Vercel 5 นาที; ไม่แคชผล API ใน service worker
- API/โครงสร้างต้นทางอาจเปลี่ยนได้ ระบบจะแจ้งข้อมูลไม่พร้อมโดยไม่แต่งข้อมูลแทน

ไฟล์เพิ่ม: api/waterlevel.js, lib/water-data.js, water-layer.js, water.css
ทดสอบ: npm test
