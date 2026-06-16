const express = require('express');
const { PORT } = require('./config');

const app = express();
app.use(express.json());
app.use(express.static('public'));

app.use(require('./routes/auth'));
app.use(require('./routes/categories'));
app.use(require('./routes/products'));
app.use(require('./routes/purchase-limits'));

app.listen(PORT, () => {
  console.log('Сервер запущен: http://localhost:' + PORT);
});
