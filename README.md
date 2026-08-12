# PUTZILAA

Portal em estilo BBS/CRT verde para comunidade de jogos e preservação digital.

## Escopo
Use o sistema somente para arquivos que você tenha direito de distribuir: homebrew,
freeware, domínio público, patches, ferramentas, documentação e outros conteúdos
autorizados. O projeto não implementa tracker BitTorrent nem fornece ROMs/ISOs
protegidas por direitos autorais.

## Stack
- Node.js + Express
- SQLite + better-sqlite3
- JWT em cookie HttpOnly
- bcrypt para senhas
- Multer para uploads
- Frontend HTML/CSS/JS sem framework

## Requisitos
Node.js 20+ recomendado.

## Instalação
```bash
npm install
copy .env.example .env
npm start
```

Linux/macOS:
```bash
cp .env.example .env
npm start
```

Abra http://localhost:3000

## Primeiro usuário
Cadastre uma conta pela interface. O primeiro usuário registrado recebe papel
`admin`. Os seguintes recebem `user`.

## Upload
O limite padrão é definido por `MAX_UPLOAD_MB`. Os uploads são armazenados em
`uploads/` e os metadados ficam no SQLite.

## Produção
- Use HTTPS.
- Defina um JWT_SECRET forte.
- Defina COOKIE_SECURE=true.
- Coloque o app atrás de um reverse proxy.
- Faça backup de `data/retro_bbs.db` e `uploads/`.
- Adicione antivírus/antimalware e armazenamento externo se necessário.
- Para arquivos grandes, prefira S3/MinIO e upload multipart.
- Configure rate limiting, CSRF adicional e verificação de e-mail antes de expor publicamente.
