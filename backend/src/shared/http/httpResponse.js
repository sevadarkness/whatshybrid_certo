module.exports = {
    success: (res, data = {}, status = 200) => res.status(status).json({ success: true, data }),
    error: (res, error, status = 500) => res.status(status).json({ success: false, error: error.message || error })
};