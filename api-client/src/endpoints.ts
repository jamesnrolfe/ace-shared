/**
 * Builds the set of Azure Functions endpoint URLs FireVerify_Admin uses.
 *
 * Not yet shared with ReInspector — several endpoint names differ between
 * the two apps (e.g. `get_all_work_objects` vs `get_work_objects_for_user`),
 * so this only covers FireVerify's set for now. Reconciling with
 * ReInspector's URLs is a separate pass.
 */
export function createAzureUrls(baseUrl: string) {
  return {
    AZURE_LOGIN_URL: `${baseUrl}/get_token`,
    AZURE_REDEEM_REFRESH_TOKEN_URL: `${baseUrl}/redeem_refresh_token`,
    AZURE_GET_ASSETS_BY_UAID_URL: `${baseUrl}/get_assets_by_uaid`,
    AZURE_GET_ASSET_HISTORY_URL: `${baseUrl}/get_asset_history`,
    AZURE_GET_GALLERY_MEDIA_URL: `${baseUrl}/get_gallery_media`,
    AZURE_GET_PROJECT_FILTER_OPTIONS_URL: `${baseUrl}/get_project_filter_options`,
    AZURE_GET_PROJECT_RESULTS_URL: `${baseUrl}/get_project_results`,
    AZURE_GET_PROJECT_COUNT_URL: `${baseUrl}/get_project_count`,
    AZURE_EXPORT_PROJECT_RESULTS_URL: `${baseUrl}/export_project_results`,
    AZURE_GET_UPLOADED_REPORTS_FOR_UAID_URL: `${baseUrl}/get_uploaded_reports_for_uaid`,
    AZURE_GET_PARTIAL_REPORTS_FOR_UAID_URL: `${baseUrl}/get_partial_reports_for_uaid`,
    AZURE_EDIT_REPORT_URL: `${baseUrl}/edit_report`,
    AZURE_GET_USERS_URL: `${baseUrl}/get_users`,
    AZURE_GET_ALL_WORK_OBJECTS_URL: `${baseUrl}/get_all_work_objects`,
    AZURE_GET_ALL_LOCATION_KEYS_URL: `${baseUrl}/get_all_location_keys`,
    AZURE_POPULATE_DRAWING_WITH_LOCATION_KEYS_URL: `${baseUrl}/populate_drawing_with_location_keys`,
    AZURE_CREATE_WORK_OBJECT_URL: `${baseUrl}/create_work_object`,
    AZURE_SUBMIT_WORK_OBJECT_URL: `${baseUrl}/submit_work_object`,
    AZURE_SET_WORK_OBJECT_ACTIVE_URL: `${baseUrl}/set_work_object_active`,
    AZURE_PAUSE_WORK_OBJECT_URL: `${baseUrl}/pause_work_object`,
    AZURE_COMPLETE_WORK_OBJECT_URL: `${baseUrl}/complete_work_object`,
    AZURE_ARCHIVE_WORK_OBJECT_URL: `${baseUrl}/archive_work_object`,
    AZURE_UNARCHIVE_WORK_OBJECT_URL: `${baseUrl}/unarchive_work_object`,
    AZURE_GET_ALL_PROJECTS_URL: `${baseUrl}/get_all_projects`,
    AZURE_GET_ALL_DRAWINGS_FOR_PROJECT_URL: `${baseUrl}/get_all_drawings_for_project`,
    AZURE_ADD_DRAWING_URL: `${baseUrl}/add_drawing`,
    AZURE_GET_UAIDS_FOR_SELECTION_URL: `${baseUrl}/get_uaids_for_selection`,
    AZURE_GET_ALL_FORMS_URL: `${baseUrl}/get_all_forms`,
    AZURE_GET_FORM_BY_ID_URL: `${baseUrl}/get_form_by_id`,
    AZURE_BUILD_CERTIFICATE_URL: `${baseUrl}/build_certificate`,
    AZURE_GET_CERTIFICATE_JOB_STATUS_URL: `${baseUrl}/get_certificate_job_status`,
    AZURE_BUILD_CERTIFICATES_BATCH_URL: `${baseUrl}/build_certificates_batch`,
    AZURE_GET_BATCH_STATUS_URL: `${baseUrl}/get_batch_status`,
    AZURE_ASSEMBLE_BATCH_ZIP_URL: `${baseUrl}/assemble_batch_zip`,
    AZURE_ASSEMBLE_BATCH_PDF_URL: `${baseUrl}/assemble_batch_pdf`,
    AZURE_UPSERT_SEARCH_URL: `${baseUrl}/upsert_search`,
    AZURE_GET_SEARCH_URL: `${baseUrl}/get_search`,
    AZURE_LIST_SEARCHES_URL: `${baseUrl}/list_searches`,
    AZURE_UPDATE_SEARCH_URL: `${baseUrl}/update_search`,
    AZURE_DELETE_SEARCH_URL: `${baseUrl}/delete_search`,
  } as const;
}
