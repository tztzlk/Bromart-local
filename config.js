require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 6767,
  BROMART_URL: process.env.BROMART_URL || 'http://192.168.2.31:8000',
};
