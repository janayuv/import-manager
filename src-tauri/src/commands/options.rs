use crate::db::{DbState, SelectOption};
use crate::commands::utils::{get_options_from_table, add_option_to_table};
use tauri::State;

// FIX: This macro now defines separate get and add commands correctly.
macro_rules! define_option_commands {
    ($($get_name:ident, $add_name:ident, $table_name:expr),*) => {
        $(
            #[tauri::command]
            pub fn $get_name(state: State<DbState>) -> Result<Vec<SelectOption>, String> {
                get_options_from_table($table_name, &state)
            }

            #[tauri::command]
            pub fn $add_name(option: SelectOption, state: State<DbState>) -> Result<(), String> {
                add_option_to_table($table_name, option, &state)
            }
        )*
    };
}

// Define all get and add commands for each option type
define_option_commands!(
    get_units, add_unit, "units",
    get_currencies, add_currency, "currencies",
    get_countries, add_country, "countries",
    get_bcd_rates, add_bcd_rate, "bcd_rates",
    get_sws_rates, add_sws_rate, "sws_rates",
    get_igst_rates, add_igst_rate, "igst_rates",
    get_categories, add_category, "categories",
    get_end_uses, add_end_use, "end_uses",
    get_purchase_uoms, add_purchase_uom, "purchase_uoms",
    // NEW: Add commands for shipment options
    get_incoterms, add_incoterm, "incoterms",
    get_shipment_modes, add_shipment_mode, "shipment_modes",
    get_shipment_types, add_shipment_type, "shipment_types",
    get_shipment_statuses, add_shipment_status, "shipment_statuses"
);

// NEW: Generic command to add an option from the frontend, called by the Shipment form.
#[tauri::command]
pub fn add_option(option_type: String, option: SelectOption, state: State<DbState>) -> Result<(), String> {
    let table_name = match option_type.as_str() {
        "category" => "categories",
        "currency" => "currencies",
        "incoterm" => "incoterms",
        "mode" => "shipment_modes",
        "type" => "shipment_types",
        "status" => "shipment_statuses",
        _ => return Err(format!("Unknown option type: {option_type}")),
    };
    add_option_to_table(table_name, option, &state)
}
