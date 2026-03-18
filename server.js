const express = require("express");
const multer = require("multer");
const AWS = require("aws-sdk");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors({
  origin: "*"
}));

/* ===================== AWS CONFIG ===================== */
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || "ap-south-1",
});

const s3 = new AWS.S3();

/* ===================== MULTER ===================== */
const upload = multer({ dest: "uploads/" });

/* ===================== UPLOAD ===================== */
app.post("/upload", upload.array("files"), async (req, res) => {
  try {
    let uploaded = [];

    for (let file of req.files) {
      const data = fs.readFileSync(file.path);

      await s3.upload({
        Bucket: "lokeek-data-storage",
        Key: `input/${file.originalname}`,
        Body: data,
      }).promise();

      uploaded.push(file.originalname);

      fs.unlinkSync(file.path);
    }

    res.json({ files: uploaded });

  } catch (err) {
    console.log("UPLOAD ERROR:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

/* ===================== MERGE ===================== */
app.post("/merge", async (req, res) => {
  try {
    const files = req.body.files;

    const mergedPdf = await PDFDocument.create();

    for (let file of files) {
      const obj = await s3.getObject({
        Bucket: "lokeek-data-storage",
        Key: `input/${file}`,
      }).promise();

      const pdf = await PDFDocument.load(obj.Body);

      const pages = await mergedPdf.copyPages(
        pdf,
        pdf.getPageIndices()
      );

      pages.forEach((p) => mergedPdf.addPage(p));
    }

    const bytes = await mergedPdf.save();

    const key = `output/merged-${Date.now()}.pdf`;

    await s3.upload({
      Bucket: "lokeek-data-storage",
      Key: key,
      Body: bytes,
    }).promise();

    const url = `https://lokeek-data-storage.s3.amazonaws.com/${key}`;

    res.json({ downloadUrl: url });

  } catch (err) {
    console.log("MERGE ERROR:", err);
    res.status(500).json({ error: "Merge failed" });
  }
});

/* ===================== HEALTH CHECK (IMPORTANT FOR RENDER) ===================== */
app.get("/", (req, res) => {
  res.send("PDF Merge API Running 🚀");
});

/* ===================== START SERVER ===================== */
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});