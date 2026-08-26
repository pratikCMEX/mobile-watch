import { Response } from "express";

export const successMessage = (
  res: Response,
  message: string,
  resData: any = {}
) => {
  return res.status(200).json({
    success: true,
    message: message,
    data: resData,
  });
};

export const successPagination = (
  res: Response,
  message: string,
  data: any = {},
  pagination?: {
    page: number;
    limit: number;
    total: number;
  }
) => {
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

export const waitMessage = (
  res: Response,
  message: string = "Error",
  resData: any = {}
) => {
  return res.status(300).json({
    success: false,
    message: message,
    data: resData,
  });
};

export const errorMessage = (
  res: Response,
  message: string = "Error",
  resData: any = {}
) => {
  return res.status(500).json({
    success: false,
    message: message,
    data: resData,
  });
};

export const customMessage = (
  res: Response,
  code: number,
  message: string = "Error",
  resData: any = {}
) => {
  return res.status(code).json({
    success: false,
    message: message,
    data: resData,
  });
};
