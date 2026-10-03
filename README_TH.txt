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
