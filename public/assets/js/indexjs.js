let formData;
    document.getElementById('discountForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      formData = {
        shop: document.getElementById('shop').value.trim(),
        token: document.getElementById('token').value.trim(),
        collection_id: document.getElementById('collection_id').value.trim(),
        percentage: parseInt(document.getElementById('percentage').value),
        price_updation_name: document.getElementById('price_updation_name').value.trim()
      };

      const statusDiv = document.getElementById('status');
      statusDiv.className = 'alert alert-info d-block';
      statusDiv.innerText = 'Checking existing discounts...';

      const checkRes = await fetch('/check-existing-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: formData.shop, collection_id: formData.collection_id })
      });

      const checkData = await checkRes.json();

      if (checkData.exists) {
        document.getElementById('existingPercentage').innerText = checkData.percentage;
        new bootstrap.Modal(document.getElementById('existingBatchModal')).show();
      } else {
        applyDiscount();
      }
    });

    document.getElementById('confirmYes').addEventListener('click', function () {
      bootstrap.Modal.getInstance(document.getElementById('existingBatchModal')).hide();
      applyDiscount();
    });

    async function applyDiscount() {
      const statusDiv = document.getElementById('status');
      statusDiv.className = 'alert alert-info d-block';
      statusDiv.innerText = "Applying discount—may take a few minutes for 50+ products. Please wait and don't refresh.";

      try {
        const response = await fetch('/apply-discount', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        const text = await response.text();
        statusDiv.className = `alert ${response.ok ? 'alert-success' : 'alert-danger'} d-block`;
        statusDiv.innerText = text;
      } catch (err) {
        statusDiv.className = 'alert alert-danger d-block';
        statusDiv.innerText = 'Error: ' + err.message;
      }
    }