const express = require("express");
const multer = require("multer");
const AWS = require("aws-sdk");
const { PDFDocument } = require("pdf-lib");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// 🔥 IMPORTANT: Your bucket region (Mumbai)
AWS.config.update({
  region: "ap-south-1",
});

const s3 = new AWS.S3();
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

      fs.unlinkSync(file.path); // delete temp file
    }

    res.json({ files: uploaded });

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Upload failed" });
  }
});
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
    console.log(err);
    res.status(500).json({ error: "Merge failed" });
  }
});

/* ===================== START SERVER ===================== */
app.listen(3000, "0.0.0.0", () => {
  console.log("Server running on port 3000");
});
