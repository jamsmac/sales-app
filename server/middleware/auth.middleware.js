const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
    // Сначала проверяем cookie
    let token = req.cookies?.auth_token;
    
    // Fallback на Authorization header для API
    if (!token) {
        const authHeader = req.headers['authorization'];
        token = authHeader && authHeader.split(' ')[1];
    }
    
    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            // Очищаем невалидную cookie
            res.clearCookie('auth_token');
            return res.status(403).json({ error: 'Недействительный токен' });
        }
        req.user = user;
        next();
    });
};
