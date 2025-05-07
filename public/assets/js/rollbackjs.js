document
        .getElementById("rollbackForm")
        .addEventListener("submit", async function (e) {
          e.preventDefault();

          const shop = document.getElementById("shop").value.trim();
          const price_updation_name = document
            .getElementById("price_updation_name")
            .value.trim();

          const statusDiv = document.getElementById("status");
          const tableContainer = document.getElementById("batchTableContainer");
          const tableBody = document.getElementById("batchTableBody");

          statusDiv.className = "alert alert-info d-block";
          statusDiv.innerText = "Checking batch details...";

          try {
            const res = await fetch("/get-batch-info", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ shop, price_updation_name }),
            });

            const data = await res.json();

            if (!res.ok || !data.exists) {
              statusDiv.className = "alert alert-danger d-block";
              statusDiv.innerText = "❌ No batch found for this name.";
              tableContainer.classList.add("d-none");
              return;
            }

            tableBody.innerHTML = `
              <tr>
                <td>${data.batch.price_updation_name}</td>
                <td>${data.batch.storeId}</td>
                <td>${data.batch.percentage}%</td>
                <td>
                  <button class="btn btn-sm btn-primary" onclick="rollbackDiscount('${data.batch.storeId}', '${data.batch.price_updation_name}')">
                    Rollback
                  </button>
                </td>
              </tr>
            `;

            statusDiv.className = "alert alert-success d-block";
            statusDiv.innerText = "✅ Batch found.";
            tableContainer.classList.remove("d-none");
          } catch (err) {
            statusDiv.className = "alert alert-danger d-block";
            statusDiv.innerText = "❌ Error: " + err.message;
            tableContainer.classList.add("d-none");
          }
        });

      async function rollbackDiscount(shop, price_updation_name) {
        const statusDiv = document.getElementById("status");
        statusDiv.className = "alert alert-info d-block";
        statusDiv.innerText = "Rolling back...";

        try {
          const res = await fetch("/rollback-discount", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shop, price_updation_name }),
          });

          const text = await res.text();
          statusDiv.className = `alert ${
            res.ok ? "alert-success" : "alert-danger"
          } d-block`;
          statusDiv.innerText = text;
          document.getElementById("batchTableContainer").style.display = "none";
        } catch (err) {
          statusDiv.className = "alert alert-danger d-block";
          statusDiv.innerText = "❌ Error: " + err.message;

        }
      }