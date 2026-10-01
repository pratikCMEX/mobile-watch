import { Response } from "express";
import { translateForResponse } from "../i18n";

// Every helper routes its `message` through translateForResponse(), which
// reads the `language` header off the request. The `message` argument is a
// stable snake_case key (not the English sentence) so re-wording a message
// or re-indenting a template literal in a controller can never break a
// lookup. The English text lives in app/i18n/locales/en.json as the value.
//
//   errorMessage(res, "device_not_found")
//   errorMessage(res, t(req, "devices_deleted_successfully", [n]))
const localize = (res: Response, key: string) => translateForResponse(res, key);

export const successMessage = (
  res: Response,
  message: string,
  resData: any = {}
) => {
  return res.status(200).json({
    success: true,
    message: localize(res, message),
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
      message: localize(res, message),
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
    message: localize(res, message),
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
    message: localize(res, message),
    data: resData,
  });
};

export const errorMessage = (
  res: Response,
  message: string = "Error",
  resData: any = {}
) => {
  return res.status(200).json({
    success: false,
    message: localize(res, message),
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
    message: localize(res, message),
    data: resData,
  });
};
