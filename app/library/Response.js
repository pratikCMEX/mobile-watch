"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customMessage = exports.errorMessage = exports.waitMessage = exports.successPagination = exports.successMessage = void 0;
const successMessage = (res, message, resData = {}) => {
    return res.status(200).json({
        success: true,
        message: message,
        data: resData,
    });
};
exports.successMessage = successMessage;
const successPagination = (res, message, data = {}, pagination) => {
    if (pagination) {
        const totalPages = Math.ceil(pagination.total / pagination.limit);
        return res.status(200).json({
            success: true,
            message,
            total: pagination.total,
            totalPages,
            currentPage: pagination.page,
            limit: pagination.limit,
            hasNext: pagination.page < totalPages,
            hasPrev: pagination.page > 1,
            data,
        });
    }
    return res.status(200).json({
        success: true,
        message,
        data,
    });
};
exports.successPagination = successPagination;
const waitMessage = (res, message = "Error", resData = {}) => {
    return res.status(300).json({
        success: false,
        message: message,
        data: resData,
    });
};
exports.waitMessage = waitMessage;
const errorMessage = (res, message = "Error", resData = {}) => {
    return res.status(500).json({
        success: false,
        message: message,
        data: resData,
    });
};
exports.errorMessage = errorMessage;
const customMessage = (res, code, message = "Error", resData = {}) => {
    return res.status(code).json({
        success: false,
        message: message,
        data: resData,
    });
};
exports.customMessage = customMessage;
