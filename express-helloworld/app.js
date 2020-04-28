var express = require('express');
app = express();

app.get('/', function (req, res) {
  res.send('Hello World!\n');
});

app.get('/mars', function (req, res) {
  res.send('Hello Mars!\n');
});

app.get('/vitor', function (req, res) {
  res.send('Hello Vitor!\n');
});

app.listen(8080, function () {
  console.log('Exemplo de aplicativo ouvindo na porta 8080!');
});

