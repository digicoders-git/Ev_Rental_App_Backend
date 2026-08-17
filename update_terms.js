const mongoose = require('mongoose');
require('dotenv').config();

const globalSettingSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    description: { type: String }
}, { timestamps: true });

const GlobalSetting = mongoose.model('GlobalSetting', globalSettingSchema);

const termsText = `Terms and Conditions

Click-Wrap Terms and Conditions for the App
These Terms constitute a legally binding agreement between you and Jungleban Enterprises., a Proprietorship incorporated in India with its registered office at 569 cha / 92 Prem nagar, alambagh, Lucknow, Uttar Pradesh 226005, governing your access to and use of the Company's mobile and/or web application, and related services.
By clicking "Accept" or using the App, you acknowledge that you have read, understood, and agree to be bound by these Terms.
1.Eligibility
You represent that you are at least 18 years of age and legally competent to enter a binding contract under the laws of India as per applicable law.
2. User Account
You agree to provide accurate, complete, and current information during account registration process at the time of signing up for the App and to keep such information updated at all times. We may require identity verification (including but not limited to OTP-based verification, government ID validation, and liveness checks) and may deny or revoke accounts that fail verification or risk checks in accordance with the applicable laws.
You are solely responsible for maintaining the confidentiality of your login credentials, OTPs, and any device used to access the App. You hereby explicitly disclaim any liability towards the Company owing to an unauthorized access and use of the App and that You are solely responsible for all activities that occur under your account with App.
You must promptly notify us in writing of any actual or suspected unauthorized access to your account.
3. Relationship with Vehicle Hire Agreement
Any hiring, leasing, or use of E-Bikes shall be governed strictly by a separate, independent Vehicle Hire Agreement executed between you and the Company.
That agreement will contain, among other things, vehicle specific terms, safety requirements, insurance details, deposit and penalties, charging or swapping rules, loss and damage allocation, and operational obligations.
In the event of any inconsistency between these Terms and the Vehicle Hire Agreement in relation to the E-Bike hire, the Vehicle Hire Agreement shall prevail. These Terms continue to govern App access, payments through the App, and other digital services.
Nothing in these Terms shall be construed to create a partnership, joint venture, agency, or employment relationship between you and the Company.

4. Consent to Data Collection and Processing

By using the App and accepting these Terms, you expressly, freely, unconditionally and unambiguously consent to the collection, access, use, processing, storage, sharing, and disclosure of your personal data by the Company in accordance with these Terms, the Digital Personal Data Protection Act, 2023, including any amendments thereto (the "DPDP Act") and applicable law and rules, including but not limited to Digital Personal Data Protection Rules, 2025, including any amendments thereto (the "DPDP Rules"), the Information Technology Act, 2000, including any amendments thereto (the "IT Act") and applicable rules, including but not limited to Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, including any amendments thereto (the "IT Rules").
For clarity, (a) the terms "data", "digital personal data", "personal data", "personal data breach", "processing" and "specified purpose" shall have the same meaning as defined under the DPDP Act; (b) any reference to "personal data" in the Terms shall mean and include "digital personal data" and (c) Company shall have no obligation whatsoever in relation to Your personal data, that is made or caused to be made publicly available by (i) You or (ii) any other person who is under an obligation under any law for the time being in force in India to make Your personal data publicly available.
5. Privacy Notice
Pursuant to your consent provided under section 4 of these Terms, the following constitutes a clear, itemized privacy notice, stating the specified purposes for which personal data is processed, the categories of personal data processed, and the manner of processing, as required under the DPDP Act.
We may collect and process the following categories of information: Personal data such as name, contact details, date of birth, identity information, photographs, driver's license details, and other KYC details as permitted by applicable law and with your consent where required.
Business and commercial use information as permitted under applicable law such as GST details, business name, and business contact information in connection with commercial subscriptions or invoicing.
Usage and device data as permitted under applicable law such as App interactions, device identifiers, IP address, location information, telematics data, trip and route data, battery status, charging logs, performance analytics, and diagnostics to enable service delivery, safety, theft prevention, fraud detection, and improvements to our services, including geo-fencing and compliance monitoring.
Payment related information necessary to process payments, excluding sensitive payment credentials which will be handled by our authorized payment partners which is permitted under applicable law.
Lawful purpose: Lawful basis for processing include your consent for, performance of a contract, compliance with legal obligations, and our legitimate interests (such as security, fraud prevention, and service improvement), each as permitted by applicable law.
Breach Notifications
We maintain incident response procedures and will notify the competent authority and affected users as required under applicable law in the event of a personal data breach.
6. Third-Party Disclosures for Operational, Verification, and Compliance Purposes
You acknowledge and consent that we may share certain user data with our trusted third-party service providers strictly for operational, verification, security, and compliance purposes, including but not limited to:
Identity verification and KYC service providers, including Aadhaar-based verification services through Unique Identification Authority of India ("UIDAI") -authorized entities, and driver's license verification through lawful channels. We do not collect or store your Aadhaar number or biometric data unless expressly permitted by law and strictly in accordance with The Aadhaar (Targeted Delivery of Financial And Other Subsidies, Benefits And Services) Act, 2016 (the "Aadhaar Act"), applicable guidelines issued from time to time by UIDAI, and only through authorized Offline/Online Verification mechanisms with your explicit consent as per applicable law.
GST verification services through authorized GSTN-integrated providers for commercial accounts, invoicing, and compliance validation.
Payment service providers, payment gateways, and payment aggregators for Unified Payments Interface ("UPI"), card payments, net banking, and payment wallets.
Providers of cloud hosting, analytics, telematics, anti-fraud tools, communication services (SMS/WhatsApp/e-mail/IVR), and customer support solutions for regulatory compliance, in accordance with unsolicited commercial communication norms.
Law enforcement or governmental authorities when required by applicable law, regulation, legal process, or in response to lawful requests.
All such sharing will be carried out under appropriate contractual and security safeguards consistent with applicable law, and service providers will be required to process personal data only on documented instructions and subject to confidentiality and security obligations.
7. Data Handling, Storage, and Protection
We implement reasonable security practices and procedures commensurate with the nature of the information we process, including organizational, technical, and physical safeguards intended to protect personal data against unauthorized access, alteration, disclosure, or destruction.
Our practices align with the DPDP Act, the IT Act and applicable rules, and industry standards such as ISO/IEC 27001 where relevant. We maintain access controls, encryption in transit and at rest where appropriate obfuscation, masking or the use of virtual tokens mapped to personal data, secure software development practices, vulnerability management, data backups and regular security testing.
We retain personal data only for as long as necessary for the purposes for which it was collected, to comply with legal obligations, resolve disputes, and enforce agreements. We maintain records of personal data processing and implement data minimization and purpose limitation principles.
In the event of a scheduled erasure of personal data, Company shall provide you with notice of not less than forty-eight (48) hours to allow you to log in or contact the Company to retain your personal data. 
8. Payments, Subscriptions, and Billing
You agree to pay all fees, charges, and applicable taxes (including GST) associated with your subscription or usage as displayed in the App or as otherwise agreed. Pricing, plans, and inclusions will be agreed to in Vehicle Hire Agreement as applicable.
We use Reserve Bank of India ("RBI") regulated payment gateways and authorized payment aggregators for processing electronic payments. UPI, card transactions, net banking, and wallet transactions are processed via authorized partners in compliance with applicable RBI guidelines, National Payments Corporation of India ("NPCI") operating rules for UPI, and, where applicable, PCI-DSS standards and card network rules.
For recurring payments, our payment partners will comply with tokenization, Additional Factor Authentication, pre-debit notifications, and e-mandate/standing instruction requirements as mandated by RBI. Where subscription auto-renewals or standing instructions are enabled, you authorize us and/or our payment partners to debit amounts due at the billing frequency shown in the App, until you cancel in accordance with the App's cancellation flow and any applicable notice periods.
Sensitive payment credentials (such as full card numbers, CVV, UPI PINs) are handled solely by authorized third-party payment processors. We do not collect or store such sensitive credentials on our systems and do not permit card data storage except in tokenized form by authorized entities as per applicable regulations.
All payments are subject to successful authorization by such third-party payment processors. Further, Company shall not be liable for any failure in the electronic payment, owing to issues arising out of such third-party payment processors and no claim shall lie against the Company. In the event of failure of electronic payment, owing to issues arising out of such third-party payment processors, any claim for refund by you shall lie solely against such third-party payment processors and not against the Company.
9. Acceptable Use and User Obligations
You agree to use the App only for lawful purposes and in accordance with these Terms and applicable law. Without limiting the foregoing, you agree that you will: Provide accurate information and documents for identity verification, KYC, and commercial use validation, and not create accounts using false or misleading information. Not impersonate any other person while using the App, conduct yourself in an offensive manner while using the App. Not suppress any material information while providing personal data, unique identifier, proof of identity or proof of address; Not register a false or frivolous grievance or complaint with the Company or with any applicable authority;
Use the App, E-Bikes, and related services in compliance with all applicable traffic, motor vehicle, environmental, and safety laws and regulations, including but not limited to the Motor Vehicles Act, 1988, including any amendments thereto and the Central Motor Vehicles Rules, 1989, including any amendments thereto, and any applicable state aggregator, bike-taxi, or commercial permit rules.
Not upload, post, email or otherwise send or transmit or introduce any material or deploy malware that contains software viruses or any other computer code, files or programs designed to interrupt, harm, damage, destroy or limit the functionality of any computer software or hardware or equipment linked directly or indirectly with the App or otherwise compromise the security of the App or any systems.
Not use the App to harvest any data, conduct scraping or reverse engineering, or otherwise compromise the integrity of the App or any systems. Not infringe any intellectual property or privacy rights or engage in any fraudulent or deceptive acts.
Breach of the provisions of this clause shall constitute a material breach and the Company may report any such breach to the relevant law enforcement authorities, and the Company may cooperate with those authorities by disclosing your identity to them. In the event of such a breach, your right to use the App will cease immediately.
10. Intellectual Property and License
The App, including its software, designs, trademarks, logos, content, and all related intellectual property, are owned by or licensed to the Company. We grant by or licensed to the Company. We grant you a limited, personal, non-exclusive, non-transferable, revocable license to access and use the App solely for your lawful personal or authorized commercial purposes in India and in accordance with these Terms.
You shall not copy, modify, distribute, create derivative works, reverse engineer, decompile, or attempt to extract the source code of the App. You grant us a worldwide, royalty-free, non-exclusive, sublicensable license to use any feedback or suggestions you provide for improving the App and services.
You do hereby knowingly, expressly, voluntarily, and irrevocably: (i) give your full and unconditional consent to the Company to use at any time and from time to time, without any restriction, Your appearance and voice in videos, photographs and other recordings related to your use of the App, on all websites and for all press, promotional, advertising, publicity, and other commercial purposes, including all formats and media, whether now known or hereafter devised, throughout the world and in perpetuity; (ii) grant to the Company the right to photograph, videotape, and otherwise record Your appearance and voice related to Your use of the App, at any time and from time to time and all rights, copyrights, title, and interests in the results of such photographs, videos, and other recordings, as a work for hire for copyright purposes, and the right to use, reproduce, exhibit, distribute, transmit, alter, and exploit, at any time and from time to time and as Company may decide in its sole discretion, such photographs, videos, and other recordings, or any component thereof, and all related merchandising, promotions, advertising, and publicity; and (iii) waive, release, and discharge all claims that You have or may have for any libel, defamation, invasion of privacy, right of publicity, infringement of copyright, or violation of any right granted by You in this section.
11. Communications and Consent
You consent to receive transactional and service-related communications, including OTPs, alerts, notices, invoices, subscription updates, payment confirmations, and safety or operational messages via SMS, WhatsApp, email, push notifications, phone calls, or in-App messages Promotional communications will be sent in accordance with applicable law and your communication preferences. You may opt out of promotional messages at any time (for SMS, by replying STOP to the sender ID, or via in-App preferences), but not of essential transactional communications necessary for service delivery.
12. Suspension, Termination, and Deactivation
We may suspend or terminate your access to the App, in whole or in part, with or without notice, If: You violate these Terms, violation of the terms in the Vehicle Hire Agreement, or applicable law. We suspect fraud, misuse, or unauthorized activity. Outstanding payments. We are required to do so by law, regulatory directive, or court order. There is a risk to safety, security, or system integrity Upon termination, your right to use the App will immediately cease. Termination does not affect any accrued rights and obligations, including outstanding payments and indemnities. Where termination relates to E-Bike use, the consequences and return obligations shall be governed by the Vehicle Hire Agreement. We may retain limited personal data after termination to the extent required by law or for establishment, exercise, or defense of legal claims.
13. Indemnity
To the fullest extent permitted by law, you agree to indemnify, defend, and hold harmless the Company, its affiliates, directors, officers, employees, and agents from and against any and all claims, liabilities, damages, losses, penalties, costs, and expenses (including reasonable legal fees) arising out of or related to your breach of these Terms or the Vehicle Hire Agreement, your violation of applicable law or/and your misuse of the App or/and E-Bikes, your negligence, willful misconduct, or infringement of third-party rights or any claims arising from your commercial use of the services.
14. Disclaimers
The App and related services are provided on an "as is" and "as available" basis. To the extent permitted by applicable law, we disclaim all warranties, express or implied, including merchantability, fitness for a particular purpose, non-infringement, and uninterrupted or error-free access.
We do not warrant that the App will be compatible with your device, free of viruses or harmful components, or that defects will be corrected. Features, specifications, and availability may change without notice. Nothing in these Terms seeks to exclude any statutory warranties or remedies that cannot be excluded under applicable Indian law.
15. Limitation of Liability
To the maximum extent permitted by applicable law, in no event shall the Company be liable for any indirect, incidental, special, punitive, exemplary, or consequential damages, including loss of profits, loss of data, loss of goodwill, business interruption, or other intangible losses, arising out of or in connection with your use of or inability to use the App.
To the extent permitted by law, our aggregate liability for direct damages arising out of or related to these Terms shall not exceed the total fees paid by you to the Company for App related services during the one (1) month immediately preceding the event giving rise to the claim.
Nothing in these Terms limits liability for death or personal injury caused by proven negligence, fraud, or any liability that cannot be excluded or limited under applicable law.
16. Grievance Redressal and Privacy Requests
If you have any grievances, complaints, or requests related to personal data or the App, please contact our designated Grievance Officer:

Name: Rajat Srivastava
Designation: Admin
Email: Suppor.Tris@gmail.com
Address: Jungleban Enterprises, Alambagh, Lucknow, Uttar Pradesh, 226005
Phone: +918840204114; Working Hours: 10:30AM - 6:00PM

We will acknowledge and address your grievance within the timelines prescribed by applicable law. You may also submit requests via any consent manager recognized under the DPDP Act, where available.
17. Updates to Terms and the App
We may update these Terms or the App from time to time to reflect changes in law, technology, features, or business practices. Where required by law, we will notify you of material changes and continued use of the App after the effective date, constitutes your acceptance of the updated Terms.
Under certain circumstances we may also elect to notify you of changes or updates to our Terms by additional means, such as pop-up or push notifications within the Products or email.
Where changes materially affect processing of personal data, we will provide appropriate notice and obtain fresh consent where required by the DPDP Act. If you do not agree to the updated Terms, you must stop using the App and may request account deactivation. 
18. Third-Party Services
The App may contain links to or integrations with third-party websites, applications, or services. We are not responsible for third-party content, terms, privacy practices, or availability.
Your use of third-party services is at your own risk and subject to the terms and policies of those providers. Where third-party services are used to process payments or personal data, such processing will be subject to terms and policies of those providers.
19. Severability and Waiver
If any provision of these Terms is found invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect.
No waiver of any term shall be deemed a continuing waiver unless expressly stated in writing. The provisions of these Terms that by their nature should survive termination (including payment obligations, indemnities, limitations of liability, intellectual property, governing law and jurisdiction, and dispute resolution) shall survive termination.
20. Assignment
You may not assign, transfer, or subcontract your rights or obligations under these Terms without our prior written consent.
We may assign or transfer our rights and obligations under these Terms to an affiliate or in connection with a merger, acquisition, or sale of assets. Any permitted assignment will be binding on successors and permitted assigns.
21. Governing Law and Jurisdiction
These Terms shall be governed by and construed in accordance with the laws of India. Subject to any applicable dispute resolution provision in the Vehicle Hire Agreement, the courts at Lucknow, Uttar Pradesh, India shall have exclusive jurisdiction over all disputes arising out of or in connection with these Terms, except disputes arising out of "personal data breach”.
Any disputes arising out of "personal data breach" shall be governed exclusively as per the Digital Personal Data Protection Act, 2023
Electronic records and electronic acceptance of these Terms are valid and enforceable under the Information Technology Act, 2000.
22. Contact Us:
For any queries regarding these Terms or the App, please contact:
JungleBan Enterprises 
Support.Tris@gmail.com
+91 8840204114
Jungleban Enterprises, Alambagh, Lucknow, Uttar Pradesh – 226005

Important Notice
By clicking "Accept" or otherwise accepting these Terms, you confirm that you have read, understood, and agree to be bound by them. If you are accepting on behalf of a business, you represent and warrant that you have the authority to bind that business to these Terms.
These Terms, together with the Vehicle Hire Agreement (where applicable), constitute the entire agreement with respect to the App and supersede all prior understandings relating thereto.`;

async function testSave() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        
        await GlobalSetting.findOneAndUpdate(
            { key: 'terms_and_conditions' },
            { key: 'terms_and_conditions', value: termsText },
            { upsert: true, new: true }
        );
        
        console.log("Success! Terms and conditions updated.");
        process.exit(0);
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}
testSave();
