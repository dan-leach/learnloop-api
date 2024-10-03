const express = require("express");
const router = express.Router();

router.post("/insertSession", (req, res) => {
  res.json("3");
});

module.exports = router;
