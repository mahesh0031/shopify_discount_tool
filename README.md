# Shopify Discount Tool

This tool allows store owners to apply bulk percentage discounts to all products in a selected Shopify collection and roll them back if needed.

## 🔧 Features

- Apply discounts to all variants in a Shopify collection
- Rollback discounts by batch name
- Clean UI with Bootstrap 5
- Modal confirmation for overwriting existing discounts

## 🛠️ Technologies Used

- HTML, CSS (Bootstrap 5)
- JavaScript (vanilla)
- ExpressJs Node.js (for backend)
- Shopify REST & GraphQL APIs
- Mongo db for database

## 🚀 Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/mahesh0031/shopify_discount_tool.git

## 🔗 Live Demo

You can access the live version of this project here:  
👉 [https://shopify-discount-tool.onrender.com/](https://shopify-discount-tool.onrender.com/)

> ⚠️ **Note**:  
> This app is hosted on [Render](https://render.com/) using the free tier.  
> After 15 minutes of inactivity, the service goes to sleep.  
> When accessed again, it may take **20–60 seconds** to wake up.

## how to get shopify access token

Step 1: Create a Custom App

> Log in to your Shopify Admin.
> Go to Settings > Apps and sales channels.
> Click Develop apps (If it’s your first time, enable app development).
> Click Create an app, name it, and select a developer.
> Once created, go to Configuration and click Configure Admin API scopes.
> Select the scopes you need (e.g., read_products, write_orders).
> Save the configuration.

Step 2: Install the App

> Go back to the app's main page and click Install App.

Step 3: Get the Access Token

> After installation, you’ll see the Admin API access token (you can only copy it once).
> Save it securely — Shopify won’t show it again.


## allow this permissions to access token 
write_products, 
read_products, 
read_inventory, 
write_inventory, 
write_product_listings, 
read_product_listings


## Or you can use this on postman as well
> for applying discount 
> endpoint : https://shopify-discount-tool.onrender.com/apply-discount
> headers
Content-Type : application/json
data -> body -> raw 
{
  "collection_id": "collection id",
  "percentage": 10,
  "price_updation_name": "Random",
  "shop": "YourStore.myshopify.com",
  "token": "shpat_##############"
}

> for rollback discount
> endpoint : https://shopify-discount-tool.onrender.com/rollback-discount
> headers
Content-Type : application/json
data -> body -> raw 
{
  "price_updation_name": "Random",
  "shop": "YourStore.myshopify.com"
}