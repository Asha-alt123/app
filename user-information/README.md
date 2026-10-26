# User Information

A web form where a user enters a name and email. The entry is saved to **Amazon RDS (MySQL)** and listed in a password-protected admin page.

```
Browser  ->  EC2 (Node.js + Express, serves HTML/CSS/JS and /api)  ->  RDS MySQL
```

## Project files

| File | Purpose |
| --- | --- |
| `server.js` | Express server and API (`POST /api/users` public; `GET /api/users` and `/admin` need the admin login) |
| `public/index.html`, `style.css`, `script.js` | The public form |
| `admin/index.html`, `admin.js` | The table of entries, behind the admin password |
| `schema.sql` | The `users` table (the server also creates it on start) |
| `.env.example` | Database settings to copy into `.env` |

## 1. Create the RDS database

1. AWS Console > RDS > **Create database** > **MySQL**. The Free tier template is fine for learning.
2. Set a master username and password. Note them down.
3. Under **Connectivity**, pick the same VPC as your EC2 instance and set **Public access: No**.
4. Create a security group for the database, for example `rds-sg`. Add an inbound rule: **MySQL/Aurora (3306)**, source = the **EC2 security group** (not 0.0.0.0/0).
5. Under **Additional configuration**, set **Initial database name** to `userinfo`.
6. When the status is Available, copy the **Endpoint** (this becomes `DB_HOST`).

## 2. Launch the EC2 instance

1. EC2 > **Launch instance** > Amazon Linux 2023, `t2.micro` or `t3.micro`.
2. Security group `ec2-sg` inbound rules: **SSH 22** from your IP only, **HTTP 80** from anywhere.
3. Connect: `ssh -i your-key.pem ec2-user@<EC2-public-IP>`

## 3. Install and run the app on EC2

```bash
# Install Node.js
sudo dnf install -y nodejs npm git

# Copy the project to the server (run this on your own computer)
scp -i your-key.pem -r user-information ec2-user@<EC2-public-IP>:~/

# On the server
cd ~/user-information
npm install
cp .env.example .env
nano .env        # fill in DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, ADMIN_PASSWORD
node server.js   # quick test, stop with Ctrl+C
```

You should see `Server running on port 3000`. If you see "Database connection failed", check `.env` and that the RDS security group allows the EC2 security group on port 3306.

## 4. Keep it running and serve it on port 80

```bash
# Keep the app running after you log out and restart it on reboot
sudo npm install -g pm2
pm2 start server.js --name user-information
pm2 save
pm2 startup        # run the command it prints

# Forward port 80 to the app using nginx
sudo dnf install -y nginx
sudo tee /etc/nginx/conf.d/app.conf > /dev/null <<'EOF'
server {
    listen 80;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
EOF
sudo systemctl enable --now nginx
```

Open `http://<EC2-public-IP>` for the form and `http://<EC2-public-IP>/admin` for the table (log in with ADMIN_USER and ADMIN_PASSWORD). Check the database link at `http://<EC2-public-IP>/api/health` (it returns `{"ok":true}`).

## Check the data in RDS

From the EC2 instance:

```bash
sudo dnf install -y mariadb105
mysql -h <RDS-endpoint> -u admin -p userinfo -e "SELECT * FROM users;"
```

## Before real use

- The table is only on `/admin`. Over plain HTTP the admin password travels unencrypted, so add HTTPS before using it for real.
- A repeated email is not saved twice, and each IP can submit 10 times per 15 minutes.
- Add HTTPS (a domain plus an Application Load Balancer with an ACM certificate, or Let's Encrypt on nginx).
- For an encrypted database connection, download the AWS CA bundle (`global-bundle.pem`) to the server and set `DB_SSL_CA` in `.env`.
- Store the database password in AWS Secrets Manager instead of `.env` for production.
